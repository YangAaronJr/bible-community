import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { sendNotificationMock, setVapidDetailsMock, createClientMock } =
  vi.hoisted(() => ({
    sendNotificationMock: vi.fn(),
    setVapidDetailsMock: vi.fn(),
    createClientMock: vi.fn(),
  }));

vi.mock("web-push", () => ({
  sendNotification: sendNotificationMock,
  setVapidDetails: setVapidDetailsMock,
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: createClientMock,
}));

import { POST } from "./route";

interface MockSupabaseOptions {
  user?: { id: string } | null;
  displayName?: string | null;
  subscriptions?: { endpoint: string; p256dh: string; auth: string }[];
  rpcError?: { message: string } | null;
}

function makeSupabaseClient(opts: MockSupabaseOptions = {}) {
  const {
    user = { id: "sender-1" },
    displayName = "Hannah Grace",
    subscriptions = [],
    rpcError = null,
  } = opts;

  const rpcMock = vi.fn(async (fnName: string) => {
    if (fnName === "get_ring_push_subscriptions") {
      return { data: rpcError ? null : subscriptions, error: rpcError };
    }
    if (fnName === "prune_stale_push_subscriptions") {
      return { data: 0, error: null };
    }
    return { data: null, error: null };
  });

  const maybeSingleMock = vi.fn(async () => ({
    data: displayName ? { display_name: displayName } : null,
    error: null,
  }));

  const fromMock = vi.fn(() => ({
    select: vi.fn(() => ({
      eq: vi.fn(() => ({
        maybeSingle: maybeSingleMock,
      })),
    })),
  }));

  return {
    auth: {
      getUser: vi.fn(async () => ({ data: { user } })),
    },
    from: fromMock,
    rpc: rpcMock,
  };
}

function makeJsonRequest(body: unknown) {
  return new Request("http://localhost/api/rings/notify", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

describe("POST /api/rings/notify", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env = {
      ...originalEnv,
      NEXT_PUBLIC_VAPID_PUBLIC_KEY: "test-public-key",
      VAPID_PRIVATE_KEY: "test-private-key",
      VAPID_SUBJECT: "mailto:test@selah.app",
    };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("returns configured: false when VAPID keys are missing", async () => {
    delete process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
    delete process.env.VAPID_PRIVATE_KEY;

    const res = await POST(makeJsonRequest({ recipientId: "user-2" }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ sent: 0, configured: false });
    expect(createClientMock).not.toHaveBeenCalled();
  });

  it("returns 400 for malformed JSON body", async () => {
    const res = await POST(makeJsonRequest("{not-valid-json"));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Invalid request body" });
  });

  it("returns 400 when recipientId is missing or whitespace", async () => {
    const res = await POST(makeJsonRequest({ circleId: "circle-1", recipientId: "   " }));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "recipientId is required" });
  });

  it("returns 401 when user is not authenticated", async () => {
    createClientMock.mockResolvedValueOnce(makeSupabaseClient({ user: null }));

    const res = await POST(makeJsonRequest({ recipientId: "user-2" }));
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "Unauthorized" });
  });

  it("returns 400 if get_ring_push_subscriptions RPC errors", async () => {
    createClientMock.mockResolvedValueOnce(
      makeSupabaseClient({ rpcError: { message: "Forbidden" } })
    );

    const res = await POST(
      makeJsonRequest({ circleId: "circle-1", recipientId: "user-2" })
    );
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Forbidden" });
  });

  it("returns sent: 0 when recipient has no push subscriptions", async () => {
    createClientMock.mockResolvedValueOnce(
      makeSupabaseClient({ subscriptions: [] })
    );

    const res = await POST(
      makeJsonRequest({ circleId: "circle-1", recipientId: "user-2" })
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      sent: 0,
      attempted: 0,
      configured: true,
    });
    expect(sendNotificationMock).not.toHaveBeenCalled();
  });

  it("sends web push notifications for circle rings and prunes 410/404 stale subscriptions", async () => {
    const supabase = makeSupabaseClient({
      user: { id: "sender-1" },
      displayName: "Hannah Grace",
      subscriptions: [
        { endpoint: "https://push.example/ok", p256dh: "k1", auth: "a1" },
        { endpoint: "https://push.example/gone-410", p256dh: "k2", auth: "a2" },
        { endpoint: "https://push.example/missing-404", p256dh: "k3", auth: "a3" },
        { endpoint: "https://push.example/temp-500", p256dh: "k4", auth: "a4" },
      ],
    });
    createClientMock.mockResolvedValueOnce(supabase);

    sendNotificationMock
      .mockResolvedValueOnce({ statusCode: 201 })
      .mockRejectedValueOnce({ statusCode: 410 })
      .mockRejectedValueOnce({ statusCode: 404 })
      .mockRejectedValueOnce({ statusCode: 500 });

    const res = await POST(
      makeJsonRequest({
        circleId: "circle-9",
        recipientId: "recipient-2",
        message: "Thinking of you in Psalm 23",
      })
    );

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      sent: 1,
      attempted: 4,
      pruned: 2,
      configured: true,
    });

    expect(setVapidDetailsMock).toHaveBeenCalledWith(
      "mailto:test@selah.app",
      "test-public-key",
      "test-private-key"
    );
    expect(sendNotificationMock).toHaveBeenCalledTimes(4);
    expect(sendNotificationMock).toHaveBeenCalledWith(
      {
        endpoint: "https://push.example/ok",
        keys: { p256dh: "k1", auth: "a1" },
      },
      JSON.stringify({
        title: "Gentle Ring from Hannah",
        body: "Thinking of you in Psalm 23",
        url: "/circles/circle-9",
        tag: "ring-circle-9-sender-1",
      })
    );

    expect(supabase.rpc).toHaveBeenCalledWith(
      "prune_stale_push_subscriptions",
      {
        p_recipient_id: "recipient-2",
        p_endpoints: [
          "https://push.example/gone-410",
          "https://push.example/missing-404",
        ],
      }
    );
  });

  it("uses /social URL and friend tag for friend rings (circleId null)", async () => {
    const supabase = makeSupabaseClient({
      user: { id: "sender-1" },
      displayName: null,
      subscriptions: [
        { endpoint: "https://push.example/ok", p256dh: "k1", auth: "a1" },
      ],
    });
    createClientMock.mockResolvedValueOnce(supabase);
    sendNotificationMock.mockResolvedValueOnce({ statusCode: 201 });

    const res = await POST(makeJsonRequest({ recipientId: "recipient-2" }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      sent: 1,
      attempted: 1,
      pruned: 0,
      configured: true,
    });

    expect(sendNotificationMock).toHaveBeenCalledWith(
      expect.anything(),
      JSON.stringify({
        title: "Gentle Ring from A Circle friend",
        body: "Praying for your time in the Word today",
        url: "/social",
        tag: "ring-friend-sender-1",
      })
    );
    expect(supabase.rpc).toHaveBeenCalledTimes(1);
  });
});
