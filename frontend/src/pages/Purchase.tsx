import { useState, useEffect } from "react";
import { useNavigate, Link } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { loadStripe } from "@stripe/stripe-js";
import { Elements, CardNumberElement, CardExpiryElement, CardCvcElement, useStripe, useElements } from "@stripe/react-stripe-js";
import { Brain, Star, Crown, Check, ArrowLeft, ArrowRight, Zap, CreditCard, Shield, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { API_URL, TOKEN_KEY } from "@/utils/constants";

const stripePromise = import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY
  ? loadStripe(import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY)
  : null;

/* ═══ Plans ═══ */
const PLANS = [
  {
    id: "starter",
    name: "Starter",
    price: 1,
    credits: 5,
    icon: Star,
    color: "from-blue-500 to-cyan-500",
    border: "border-blue-500/30",
    features: ["5 AI Credits", "Resume Analysis", "Basic ATS Score", "AI Suggestions"],
  },
  {
    id: "pro",
    name: "Pro",
    price: 3,
    credits: 20,
    icon: Crown,
    color: "from-indigo-500 to-purple-600",
    border: "border-indigo-500/50",
    popular: true,
    features: ["20 AI Credits", "Full AI Analysis", "Cover Letters & Bios", "Mock Interviews", "Job Match", "Career Growth"],
  },
];

/* ═══ Step Indicator ═══ */
function Steps({ current }: { current: number }) {
  const labels = ["Choose Plan", "Payment", "Complete"];
  return (
    <div className="mb-8 flex items-center justify-center gap-2">
      {labels.map((label, i) => (
        <div key={label} className="flex items-center gap-2">
          <div className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold transition-colors ${
            i <= current ? "bg-indigo-500 text-white" : "bg-gray-200 text-gray-500 dark:bg-gray-700"
          }`}>
            {i < current ? <Check className="h-4 w-4" /> : i + 1}
          </div>
          <span className={`hidden text-sm font-medium sm:inline ${i <= current ? "text-gray-900 dark:text-white" : "text-gray-400"}`}>
            {label}
          </span>
          {i < labels.length - 1 && <div className={`mx-1 h-px w-8 ${i < current ? "bg-indigo-500" : "bg-gray-300 dark:bg-gray-700"}`} />}
        </div>
      ))}
    </div>
  );
}

/* ═══ Step 1: Plan Selection ═══ */
function PlanStep({ selected, onSelect, onContinue }: { selected: string; onSelect: (id: string) => void; onContinue: () => void }) {
  const { user } = useAuth();
  return (
    <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}>
      <div className="grid min-w-0 gap-6 lg:grid-cols-[280px_1fr]">
        {/* Sidebar: profile + credits */}
        <div className="space-y-4">
          <div className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-700 dark:bg-slate-900">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 text-lg font-bold text-white">
                {user?.name?.charAt(0).toUpperCase() || "U"}
              </div>
              <div>
                <p className="text-sm font-semibold text-gray-900 dark:text-white">{user?.name}</p>
                <p className="text-xs text-gray-500">{user?.email?.toLowerCase()}</p>
              </div>
            </div>
          </div>
          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-center dark:border-amber-800 dark:bg-amber-900/20">
            <Zap className="mx-auto mb-1 h-5 w-5 text-amber-500" />
            <p className="text-2xl font-bold text-amber-600 dark:text-amber-400">{user?.aiCredits ?? 0}</p>
            <p className="text-xs text-amber-700 dark:text-amber-300">Credits Remaining</p>
          </div>
        </div>

        {/* Plan cards */}
        <div>
          <h2 className="mb-1 text-2xl font-bold text-gray-900 dark:text-white">Choose Your Perfect Plan</h2>
          <p className="mb-6 text-sm text-gray-500 dark:text-gray-400">Select the plan that fits your needs</p>
          <div className="grid gap-4 sm:grid-cols-2">
            {PLANS.map((plan) => {
              const isSelected = selected === plan.id;
              return (
                <button key={plan.id} onClick={() => onSelect(plan.id)}
                  className={`relative rounded-2xl border-2 p-6 text-left transition-all ${
                    isSelected ? `${plan.border} bg-indigo-50/50 ring-2 ring-indigo-500/20 dark:bg-indigo-900/10` : "border-gray-200 hover:border-gray-300 dark:border-gray-700"
                  }`}>
                  {plan.popular && (
                    <span className="absolute -top-2.5 right-4 rounded-full bg-indigo-500 px-3 py-0.5 text-[10px] font-bold text-white">BEST VALUE</span>
                  )}
                  <div className={`mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br ${plan.color} text-white shadow-lg`}>
                    <plan.icon className="h-5 w-5" />
                  </div>
                  <p className="text-lg font-bold text-gray-900 dark:text-white">{plan.name}</p>
                  <p className="mb-4 text-2xl font-extrabold text-gray-900 dark:text-white">
                    ${plan.price} <span className="text-sm font-normal text-gray-500">for {plan.credits} credits</span>
                  </p>
                  <ul className="space-y-1.5">
                    {plan.features.map((f) => (
                      <li key={f} className="flex items-center gap-2 text-xs text-gray-600 dark:text-gray-400">
                        <Check className="h-3 w-3 text-indigo-500" /> {f}
                      </li>
                    ))}
                  </ul>
                </button>
              );
            })}
          </div>
          <Button className="mt-6 w-full gap-2 sm:w-auto" onClick={onContinue} disabled={!selected}>
            Continue to Payment <ArrowRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </motion.div>
  );
}

/* ═══ Step 2: Stripe Payment Form ═══ */
function PaymentForm({ plan, onBack, onSuccess }: { plan: typeof PLANS[0]; onBack: () => void; onSuccess: () => void }) {
  const stripe = useStripe();
  const elements = useElements();
  const [isProcessing, setIsProcessing] = useState(false);
  const [name, setName] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!stripe || !elements) return;
    setIsProcessing(true);

    try {
      const token = localStorage.getItem(TOKEN_KEY);
      // 1. Create payment intent on backend
      const res = await fetch(`${API_URL}/stripe/create-payment-intent`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ planId: plan.id }),
      });
      const data = await res.json();
      if (!res.ok) { toast.error(data.message || "Payment setup failed"); return; }

      // 2. Confirm payment with Stripe
      const cardNumber = elements.getElement(CardNumberElement);
      if (!cardNumber) { toast.error("Card details incomplete"); return; }

      const { error, paymentIntent } = await stripe.confirmCardPayment(data.clientSecret, {
        payment_method: { card: cardNumber, billing_details: { name: name || undefined } },
      });

      if (error) {
        toast.error(error.message || "Payment failed");
      } else if (paymentIntent?.status === "succeeded") {
        // 3. Confirm with backend to add credits
        await fetch(`${API_URL}/stripe/confirm-purchase`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({ paymentIntentId: paymentIntent.id, planId: plan.id }),
        });
        onSuccess();
      }
    } catch {
      toast.error("Payment failed. Please try again.");
    } finally {
      setIsProcessing(false);
    }
  };

  const elementStyle = {
    style: {
      base: { fontSize: "16px", color: "#1f2937", fontFamily: "Inter, system-ui, sans-serif", "::placeholder": { color: "#9ca3af" } },
      invalid: { color: "#ef4444" },
    },
  };

  return (
    <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}>
      <button onClick={onBack} className="mb-4 flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 dark:hover:text-gray-300">
        <ArrowLeft className="h-4 w-4" /> Back to plans
      </button>

      <div className="grid min-w-0 gap-6 lg:grid-cols-[1fr_320px]">
        <form onSubmit={handleSubmit} className="min-w-0 space-y-5">
          <h2 className="text-xl font-bold text-gray-900 dark:text-white">Payment Details</h2>

          {/* Card preview */}
          <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-indigo-600 via-purple-600 to-indigo-700 p-6 text-white shadow-xl">
            <div className="absolute -right-8 -top-8 h-32 w-32 rounded-full bg-white/10" />
            <CreditCard className="mb-6 h-8 w-8 opacity-80" />
            <div className="mb-4 font-mono text-lg tracking-widest">•••• •••• •••• ••••</div>
            <div className="flex justify-between text-sm opacity-80">
              <span>{name || "CARDHOLDER NAME"}</span>
              <span>••/••</span>
            </div>
          </div>

          {/* Card fields */}
          <div className="space-y-4">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">Cardholder Name</label>
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="John Smith"
                className="w-full rounded-xl border border-gray-300 bg-white px-4 py-3 text-sm shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 dark:border-gray-600 dark:bg-gray-800 dark:text-white" />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">Card Number</label>
              <div className="rounded-xl border border-gray-300 bg-white px-4 py-3 dark:border-gray-600 dark:bg-gray-800">
                <CardNumberElement options={elementStyle} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">Expiry</label>
                <div className="rounded-xl border border-gray-300 bg-white px-4 py-3 dark:border-gray-600 dark:bg-gray-800">
                  <CardExpiryElement options={elementStyle} />
                </div>
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">CVC</label>
                <div className="rounded-xl border border-gray-300 bg-white px-4 py-3 dark:border-gray-600 dark:bg-gray-800">
                  <CardCvcElement options={elementStyle} />
                </div>
              </div>
            </div>
          </div>

          <Button type="submit" className="w-full gap-2 py-3 text-base shadow-xl shadow-indigo-500/25"
            isLoading={isProcessing} disabled={!stripe || isProcessing}>
            {isProcessing ? "Processing..." : `Complete Purchase — $${plan.price}`}
          </Button>
          <p className="flex items-center justify-center gap-1.5 text-xs text-gray-400">
            <Shield className="h-3 w-3" /> Secured by Stripe. We never store your card details.
          </p>
        </form>

        {/* Order summary */}
        <div className="rounded-2xl border border-gray-200 bg-white p-6 dark:border-gray-700 dark:bg-slate-900">
          <h3 className="mb-4 text-sm font-bold text-gray-900 dark:text-white">Order Summary</h3>
          <div className="mb-4 flex items-center gap-3 rounded-xl bg-gray-50 p-3 dark:bg-gray-800">
            <div className={`flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br ${plan.color} text-white`}>
              <plan.icon className="h-4 w-4" />
            </div>
            <div>
              <p className="text-sm font-semibold text-gray-900 dark:text-white">{plan.name} Plan</p>
              <p className="text-xs text-gray-500">{plan.credits} AI Credits</p>
            </div>
          </div>
          <div className="space-y-2 border-t border-gray-100 pt-3 dark:border-gray-700">
            <div className="flex justify-between text-sm"><span className="text-gray-500">Subtotal</span><span className="text-gray-900 dark:text-white">${plan.price}.00</span></div>
            <div className="flex justify-between text-sm"><span className="text-gray-500">Tax</span><span className="text-gray-900 dark:text-white">$0.00</span></div>
            <div className="flex justify-between border-t border-gray-100 pt-2 text-base font-bold dark:border-gray-700">
              <span className="text-gray-900 dark:text-white">Total</span>
              <span className="text-indigo-600 dark:text-indigo-400">${plan.price}.00</span>
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

/* ═══ Step 3: Success ═══ */
function SuccessStep({ plan }: { plan: typeof PLANS[0] }) {
  const navigate = useNavigate();
  const { loadUser } = useAuth();

  useEffect(() => {
    void loadUser();
    const t = setTimeout(() => navigate("/dashboard"), 4000);
    return () => clearTimeout(t);
  }, [loadUser, navigate]);

  return (
    <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="py-12 text-center">
      <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: "spring", delay: 0.2 }}
        className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-green-100 dark:bg-green-900/30">
        <Sparkles className="h-9 w-9 text-green-500" />
      </motion.div>
      <h2 className="mb-2 text-2xl font-bold text-gray-900 dark:text-white">Credits Successfully Added! 🚀</h2>
      <p className="mb-6 text-gray-500 dark:text-gray-400">
        {plan.credits} AI credits have been added to your account.
      </p>
      <Link to="/dashboard">
        <Button className="gap-2">Go to Dashboard <ArrowRight className="h-4 w-4" /></Button>
      </Link>
      <p className="mt-3 text-xs text-gray-400">Redirecting automatically in a few seconds...</p>
    </motion.div>
  );
}

/* ═══ Main Page ═══ */
export function PurchasePage() {
  const [step, setStep] = useState(0);
  const [selectedPlan, setSelectedPlan] = useState("pro");

  const plan = PLANS.find((p) => p.id === selectedPlan) || PLANS[1];

  return (
    <div className="min-h-screen min-w-0 overflow-x-hidden bg-gray-50 dark:bg-slate-950">
      {/* Top bar */}
      <div className="border-b border-gray-200 bg-white px-3 py-4 sm:px-4 md:px-6 lg:px-8 dark:border-gray-800 dark:bg-slate-900">
        <div className="mx-auto flex max-w-5xl items-center justify-between">
          <Link to="/" className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-indigo-500 to-purple-600">
              <Brain className="h-4 w-4 text-white" />
            </div>
            <span className="text-lg font-bold text-gray-900 dark:text-white">
              Resume<span className="bg-gradient-to-r from-indigo-400 to-purple-400 bg-clip-text text-transparent">AI</span>
            </span>
          </Link>
          <Link to="/dashboard" className="text-sm text-gray-500 hover:text-gray-700 dark:hover:text-gray-300">← Back to Dashboard</Link>
        </div>
      </div>

      <div className="mx-auto max-w-5xl px-3 py-8 sm:px-4 md:px-6 lg:px-8">
        <Steps current={step} />

        <AnimatePresence mode="wait">
          {step === 0 && (
            <PlanStep key="plan" selected={selectedPlan} onSelect={setSelectedPlan}
              onContinue={() => setStep(1)} />
          )}
          {step === 1 && stripePromise && (
            <Elements key="payment" stripe={stripePromise}>
              <PaymentForm plan={plan} onBack={() => setStep(0)} onSuccess={() => { setStep(2); toast.success("Payment successful! 🎉"); }} />
            </Elements>
          )}
          {step === 2 && (
            <SuccessStep key="success" plan={plan} />
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
