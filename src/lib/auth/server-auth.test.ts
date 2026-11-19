import { beforeEach, describe, expect, it, vi } from "vitest";

const { createClientMock } = vi.hoisted(() => ({
  createClientMock: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: createClientMock,
}));

import { getInitialSessionProfile } from "./server-auth";

interface MockUser {
  id: string;
  email?: string | null;
  user_metadata?: Record<string, unknown>;
}

interface MakeSupabaseOptions {
  user?: MockUser | null;
  authError?: { message: string } | null;
  authReject?: Error;
  profile?: { display_name?: string | null; avatar_url?: string | null } | null;
  profileError?: { message: string } | null;
  profileReject?: Error;
}

function makeSupabaseClient(opts: MakeSupabaseOptions = {}) {
  const {
    user = null,
    authError = null,
    authReject,
    profile = null,
    profileError = null,
    profileReject,
  } = opts;

  const maybeSingleMock = vi.fn(async () => {
    if (profileReject) {
      throw profileReject;
    }
    return {
      data: profile,
      error: profileError,
    };
  });

  const eqMock = vi.fn(() => ({
    maybeSingle: maybeSingleMock,
  }));

  const selectMock = vi.fn(() => ({
    eq: eqMock,
  }));

  const fromMock = vi.fn(() => ({
    select: selectMock,
  }));

  const getUserMock = vi.fn(async () => {
    if (authReject) {
      throw authReject;
    }
    return {
      data: { user },
      error: authError,
    };
  });

  return {
    client: {
      auth: { getUser: getUserMock },
      from: fromMock,
    },
    spies: {
      getUserMock,
      fromMock,
      selectMock,
      eqMock,
      maybeSingleMock,
    },
  };
}

describe("getInitialSessionProfile", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns null session fields when user is unauthenticated", async () => {
    const { client, spies } = makeSupabaseClient({ user: null });
    createClientMock.mockResolvedValueOnce(client);

    const result = await getInitialSessionProfile();

    expect(result).toEqual({
      userId: null,
      displayName: null,
      avatarUrl: null,
    });
    expect(spies.fromMock).not.toHaveBeenCalled();
  });

  it("returns null session fields when auth.getUser returns an error", async () => {
    const { client, spies } = makeSupabaseClient({
      user: { id: "user-1", email: "grace@example.com" },
      authError: { message: "Session expired" },
    });
    createClientMock.mockResolvedValueOnce(client);

    const result = await getInitialSessionProfile();

    expect(result).toEqual({
      userId: null,
      displayName: null,
      avatarUrl: null,
    });
    expect(spies.fromMock).not.toHaveBeenCalled();
  });

  it("returns null session fields when auth.getUser rejects", async () => {
    const { client } = makeSupabaseClient({
      authReject: new Error("Network failure"),
    });
    createClientMock.mockResolvedValueOnce(client);

    const result = await getInitialSessionProfile();

    expect(result).toEqual({
      userId: null,
      displayName: null,
      avatarUrl: null,
    });
  });

  it("returns null session fields when createClient throws", async () => {
    createClientMock.mockRejectedValueOnce(new Error("Missing cookies context"));

    const result = await getInitialSessionProfile();

    expect(result).toEqual({
      userId: null,
      displayName: null,
      avatarUrl: null,
    });
  });

  it("returns authenticated profile display_name and avatar_url when present", async () => {
    const { client, spies } = makeSupabaseClient({
      user: {
        id: "user-42",
        email: "hannah@example.com",
        user_metadata: { display_name: "Meta Hannah" },
      },
      profile: {
        display_name: "  Hannah Grace  ",
        avatar_url: "https://cdn.example.com/hannah.png",
      },
    });
    createClientMock.mockResolvedValueOnce(client);

    const result = await getInitialSessionProfile();

    expect(result).toEqual({
      userId: "user-42",
      displayName: "Hannah Grace",
      avatarUrl: "https://cdn.example.com/hannah.png",
    });
    expect(spies.fromMock).toHaveBeenCalledWith("profiles");
    expect(spies.selectMock).toHaveBeenCalledWith("display_name, avatar_url");
    expect(spies.eqMock).toHaveBeenCalledWith("id", "user-42");
    expect(spies.maybeSingleMock).toHaveBeenCalledTimes(1);
  });

  it("falls back to user_metadata.display_name, then email prefix, then Reader", async () => {
    const metaFallback = makeSupabaseClient({
      user: {
        id: "user-meta",
        email: "peter@example.com",
        user_metadata: { display_name: "  Peter K.  " },
      },
      profile: null,
    });
    createClientMock.mockResolvedValueOnce(metaFallback.client);

    expect(await getInitialSessionProfile()).toEqual({
      userId: "user-meta",
      displayName: "Peter K.",
      avatarUrl: null,
    });

    const emailFallback = makeSupabaseClient({
      user: {
        id: "user-email",
        email: "luke@example.com",
        user_metadata: { display_name: "   " },
      },
      profile: { display_name: "  ", avatar_url: "" },
    });
    createClientMock.mockResolvedValueOnce(emailFallback.client);

    expect(await getInitialSessionProfile()).toEqual({
      userId: "user-email",
      displayName: "luke",
      avatarUrl: null,
    });

    const readerFallback = makeSupabaseClient({
      user: {
        id: "user-anon",
        email: null,
        user_metadata: {},
      },
      profile: null,
    });
    createClientMock.mockResolvedValueOnce(readerFallback.client);

    expect(await getInitialSessionProfile()).toEqual({
      userId: "user-anon",
      displayName: "Reader",
      avatarUrl: null,
    });
  });

  it("preserves userId and fallback displayName when profile lookup fails", async () => {
    const rejectedProfile = makeSupabaseClient({
      user: {
        id: "user-resilient",
        email: "martha@example.com",
        user_metadata: { display_name: "Martha" },
      },
      profileReject: new Error("DB timeout"),
    });
    createClientMock.mockResolvedValueOnce(rejectedProfile.client);

    expect(await getInitialSessionProfile()).toEqual({
      userId: "user-resilient",
      displayName: "Martha",
      avatarUrl: null,
    });

    const erroredProfile = makeSupabaseClient({
      user: {
        id: "user-resilient-2",
        email: "john@example.com",
      },
      profile: null,
      profileError: { message: "RLS denied" },
    });
    createClientMock.mockResolvedValueOnce(erroredProfile.client);

    expect(await getInitialSessionProfile()).toEqual({
      userId: "user-resilient-2",
      displayName: "john",
      avatarUrl: null,
    });
  });
});
