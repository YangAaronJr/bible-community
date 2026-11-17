import { sendNotification, setVapidDetails } from "web-push";
import { createClient } from "@/lib/supabase/server";

interface NotifyRingBody {
  circleId?: string | null;
  recipientId?: string;
  message?: string;
}

export async function POST(request: Request) {
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;

  if (!publicKey || !privateKey) {
    return Response.json({ sent: 0, configured: false }, { status: 200 });
  }

  let body: NotifyRingBody;
  try {
    body = (await request.json()) as NotifyRingBody;
  } catch {
    return Response.json({ error: "Invalid request body" }, { status: 400 });
  }

  const circleId = body.circleId?.trim() || null;
  const recipientId = body.recipientId?.trim();
  if (!recipientId) {
    return Response.json(
      { error: "recipientId is required" },
      { status: 400 }
    );
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const [{ data: senderProfile }, { data: subscriptions, error: rpcError }] =
    await Promise.all([
      supabase
        .from("profiles")
        .select("display_name")
        .eq("id", user.id)
        .maybeSingle(),
      supabase.rpc("get_ring_push_subscriptions", {
        p_circle_id: circleId,
        p_recipient_id: recipientId,
      }),
    ]);

  if (rpcError) {
    return Response.json({ error: rpcError.message }, { status: 400 });
  }

  const subs = subscriptions || [];
  if (subs.length === 0) {
    return Response.json({ sent: 0, attempted: 0, configured: true });
  }

  const subject = process.env.VAPID_SUBJECT || "mailto:rings@selah.app";
  setVapidDetails(subject, publicKey, privateKey);

  const senderFirst =
    senderProfile?.display_name?.split(" ")[0] || "A Circle friend";
  const payload = JSON.stringify({
    title: `Gentle Ring from ${senderFirst}`,
    body: body.message || "Praying for your time in the Word today",
    url: circleId ? `/circles/${circleId}` : "/social",
    tag: `ring-${circleId || "friend"}-${user.id}`,
  });

  const results = await Promise.allSettled(
    subs.map((sub) =>
      sendNotification(
        {
          endpoint: sub.endpoint,
          keys: {
            p256dh: sub.p256dh,
            auth: sub.auth,
          },
        },
        payload
      )
    )
  );

  const sent = results.filter((r) => r.status === "fulfilled").length;

  const staleEndpoints: string[] = [];
  results.forEach((result, idx) => {
    if (result.status === "rejected") {
      const reason = result.reason as { statusCode?: number } | null;
      if (reason && (reason.statusCode === 410 || reason.statusCode === 404)) {
        staleEndpoints.push(subs[idx].endpoint);
      }
    }
  });

  if (staleEndpoints.length > 0) {
    try {
      await supabase.rpc("prune_stale_push_subscriptions", {
        p_recipient_id: recipientId,
        p_endpoints: staleEndpoints,
      });
    } catch {
      // Best-effort pruning; do not fail ring notification response
    }
  }

  return Response.json({
    sent,
    attempted: subs.length,
    pruned: staleEndpoints.length,
    configured: true,
  });
}
