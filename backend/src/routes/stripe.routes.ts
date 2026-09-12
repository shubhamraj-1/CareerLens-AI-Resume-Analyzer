import { Router, type Request, type Response, type NextFunction } from "express";
import { authenticate } from "../middlewares/auth";
import { sendSuccess, sendError } from "../helpers/response";
import { env } from "../config/env";
import prisma from "../config/database";
import type { AuthenticatedRequest } from "../types";

const router = Router();

// ── POST /api/stripe/create-checkout ────────────────────────────
// Creates a Stripe Checkout Session and returns the hosted URL.
// If STRIPE_PRICE_ID is not set, auto-creates a $4.99/mo recurring price.
router.post("/create-checkout", authenticate, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.user) { sendError(res, "Unauthorized", 401); return; }
    if (!env.STRIPE_SECRET_KEY) {
      sendError(res, "Stripe is not configured. Please set STRIPE_SECRET_KEY in your .env file.", 500);
      return;
    }

    const Stripe = (await import("stripe")).default;
    const stripe = new Stripe(env.STRIPE_SECRET_KEY);

    const user = await prisma.user.findUnique({ where: { id: req.user.userId } });
    if (!user) { sendError(res, "User not found", 404); return; }
    if (user.isPro) { sendError(res, "You are already on the Pro plan!", 400); return; }

    // Use configured price ID, or auto-create one
    let priceId = env.STRIPE_PRICE_ID;
    if (!priceId) {
      console.log("[Stripe] No STRIPE_PRICE_ID set — creating product + price automatically...");
      const product = await stripe.products.create({
        name: "ResumeAI Pro",
        description: "Unlimited AI resume scans, cover letters, mock interviews & more",
      });
      const price = await stripe.prices.create({
        product: product.id,
        unit_amount: 499, // $4.99 in cents
        currency: "usd",
        recurring: { interval: "month" },
      });
      priceId = price.id;
      console.log(`[Stripe] ✅ Created price: ${priceId} (save this as STRIPE_PRICE_ID in .env for faster startups)`);
    }

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      payment_method_types: ["card"],
      customer_email: user.email,
      client_reference_id: user.id,
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${env.FRONTEND_URL}/dashboard?session_id={CHECKOUT_SESSION_ID}&upgraded=true`,
      cancel_url: `${env.FRONTEND_URL}/pricing`,
      metadata: { userId: user.id },
    });

    sendSuccess(res, { id: session.id, url: session.url });
  } catch (error) {
    next(error);
  }
});

// ── POST /api/stripe/webhook ────────────────────────────────────
// Stripe sends events here. We listen for checkout.session.completed
// to upgrade the user to Pro.
// NOTE: This route needs the RAW body (not JSON-parsed).
// The raw body middleware is mounted in server.ts BEFORE express.json().
router.post("/webhook", async (req: Request, res: Response) => {
  if (!env.STRIPE_SECRET_KEY || !env.STRIPE_WEBHOOK_SECRET) {
    res.status(500).json({ error: "Stripe not configured" });
    return;
  }

  const Stripe = (await import("stripe")).default;
  const stripe = new Stripe(env.STRIPE_SECRET_KEY);

  const sig = req.headers["stripe-signature"] as string;

  let event;
  try {
    // req.body must be the raw buffer — see server.ts rawBodyMiddleware
    event = stripe.webhooks.constructEvent(
      (req as unknown as { rawBody: Buffer }).rawBody,
      sig,
      env.STRIPE_WEBHOOK_SECRET
    );
  } catch (err) {
    console.error("[Stripe Webhook] Signature verification failed:", (err as Error).message);
    res.status(400).json({ error: "Webhook signature verification failed" });
    return;
  }

  // Handle the event
  if (event.type === "checkout.session.completed") {
    const session = event.data.object;
    const userId = session.metadata?.userId;
    const customerId = typeof session.customer === "string" ? session.customer : session.customer?.toString();

    if (userId) {
      await prisma.user.update({
        where: { id: userId },
        data: {
          isPro: true,
          aiCredits: 100,
          stripeCustomerId: customerId || undefined,
        },
      });
      console.log(`[Stripe] ✅ User ${userId} upgraded to Pro — 100 AI credits granted (customer: ${customerId})`);
    }
  }

  res.json({ received: true });
});

// ═══════════════════════════════════════════════════════════════
// Credit-based one-time purchases (Stripe PaymentIntents)
// ═══════════════════════════════════════════════════════════════

const CREDIT_PLANS: Record<string, { price: number; credits: number; label: string }> = {
  starter: { price: 100, credits: 5, label: "Starter (5 Credits)" },   // $1.00 in cents
  pro:     { price: 300, credits: 20, label: "Pro (20 Credits)" },     // $3.00 in cents
};

// ── POST /api/stripe/create-payment-intent ──────────────────────
router.post("/create-payment-intent", authenticate, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.user) { sendError(res, "Unauthorized", 401); return; }
    if (!env.STRIPE_SECRET_KEY) { sendError(res, "Stripe not configured", 500); return; }

    const { planId } = req.body;
    const plan = CREDIT_PLANS[planId as string];
    if (!plan) { sendError(res, "Invalid plan selected", 400); return; }

    const Stripe = (await import("stripe")).default;
    const stripe = new Stripe(env.STRIPE_SECRET_KEY);

    const paymentIntent = await stripe.paymentIntents.create({
      amount: plan.price,
      currency: "usd",
      metadata: { userId: req.user.userId, planId: planId as string, credits: String(plan.credits) },
      description: `ResumeAI — ${plan.label}`,
    });

    sendSuccess(res, { clientSecret: paymentIntent.client_secret });
  } catch (error) {
    next(error);
  }
});

// ── POST /api/stripe/confirm-purchase ───────────────────────────
// Called by frontend after Stripe confirms the payment.
// Verifies the payment and adds credits to the user's account.
router.post("/confirm-purchase", authenticate, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.user) { sendError(res, "Unauthorized", 401); return; }
    if (!env.STRIPE_SECRET_KEY) { sendError(res, "Stripe not configured", 500); return; }

    const { paymentIntentId, planId } = req.body;
    if (!paymentIntentId || !planId) { sendError(res, "paymentIntentId and planId required", 400); return; }

    const plan = CREDIT_PLANS[planId as string];
    if (!plan) { sendError(res, "Invalid plan", 400); return; }

    // Verify the payment actually succeeded with Stripe
    const Stripe = (await import("stripe")).default;
    const stripe = new Stripe(env.STRIPE_SECRET_KEY);
    const intent = await stripe.paymentIntents.retrieve(paymentIntentId as string);

    if (intent.status !== "succeeded") {
      sendError(res, "Payment has not been completed", 400);
      return;
    }

    // Verify the payment intent belongs to this user
    if (intent.metadata.userId !== req.user.userId) {
      sendError(res, "Payment verification failed", 403);
      return;
    }

    // Add credits + set isPro
    const updated = await prisma.user.update({
      where: { id: req.user.userId },
      data: {
        isPro: true,
        aiCredits: { increment: plan.credits },
      },
      select: { aiCredits: true, isPro: true },
    });

    console.log(`[Purchase] ✅ User ${req.user.userId} bought ${plan.label} — now has ${updated.aiCredits} credits`);
    sendSuccess(res, { credits: updated.aiCredits, isPro: updated.isPro });
  } catch (error) {
    next(error);
  }
});

export default router;
