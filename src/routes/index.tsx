import { createFileRoute, Link } from "@tanstack/react-router";
import {
  HeartPulse,
  Pill,
  CalendarCheck,
  FileText,
  ShieldCheck,
  LayoutDashboard,
  Sparkles,
  Smartphone,
  Lock,
  CheckCircle2,
  ArrowRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { SiteLayout } from "@/components/site/SiteLayout";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Cure AI — Smarter Health Starts Here" },
      { name: "description", content: "Cure AI is a modern healthcare management platform. Organize medicines, appointments, and health records in one secure place." },
      { property: "og:title", content: "Cure AI — Smarter Health Starts Here" },
      { property: "og:description", content: "Organize medicines, appointments, and health records in one secure place." },
    ],
  }),
  component: Home,
});

const features = [
  { icon: LayoutDashboard, title: "Health Dashboard", desc: "A clean overview of your day — medicines, visits, and key records at a glance." },
  { icon: Pill, title: "Medicine Management", desc: "Track prescriptions, dosages and reminder times in one organized place." },
  { icon: CalendarCheck, title: "Appointment Tracking", desc: "Keep doctor visits and hospital appointments neatly scheduled." },
  { icon: FileText, title: "Health Records", desc: "Store and access lab reports and documents securely from any device." },
  { icon: ShieldCheck, title: "Secure Account", desc: "Enterprise-grade authentication keeps your information protected." },
  { icon: Sparkles, title: "Built for the Future", desc: "Designed to easily extend with AI-powered insights in upcoming versions." },
];

const benefits = [
  { icon: HeartPulse, title: "Easy to use", desc: "Simple flows for adding medicines, appointments and records." },
  { icon: Lock, title: "Secure by default", desc: "Your data is protected with modern authentication and row-level security." },
  { icon: Smartphone, title: "Mobile friendly", desc: "A responsive interface that works beautifully on every device." },
  { icon: ShieldCheck, title: "Reliable", desc: "A robust foundation built on modern web technology." },
];

const testimonials = [
  { name: "Dr. Anjali Verma", role: "General Physician", quote: "Cure AI gives my patients a way to stay on top of their treatment between visits. The interface is wonderfully clean." },
  { name: "Rahul Mehta", role: "Patient", quote: "I finally have all my prescriptions and reports in one place. It just works." },
  { name: "Priya Sharma", role: "Caregiver", quote: "Tracking my mother's appointments and medicines has never been easier." },
];

const faqs = [
  { q: "Is Cure AI free to use?", a: "Yes, the current version is free while we build out the product. Premium plans will arrive with future updates." },
  { q: "Is my health data secure?", a: "Absolutely. We use modern authentication and row-level security so only you can access your data." },
  { q: "Can I use it on my phone?", a: "Yes — Cure AI is fully responsive and works on desktop, tablet, and mobile." },
  { q: "Will AI features be added?", a: "Yes. This is Version 1. AI symptom checking, health insights, and a wellness assistant are planned for future releases." },
  { q: "Do I need to install anything?", a: "No. Cure AI runs entirely in your browser — just create an account and you're ready." },
  { q: "Can I export my data?", a: "Data export will be available in upcoming releases." },
];

function Home() {
  return (
    <SiteLayout>
      {/* Hero */}
      <section className="gradient-hero">
        <div className="mx-auto max-w-7xl px-4 py-20 sm:px-6 sm:py-28 lg:px-8">
          <div className="mx-auto max-w-3xl text-center">
            <div className="mx-auto inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1 text-xs font-medium text-muted-foreground shadow-soft">
              <Sparkles className="h-3.5 w-3.5 text-primary" />
              Version 1 · MVP
            </div>
            <h1 className="mt-6 font-display text-4xl font-bold leading-tight text-foreground sm:text-6xl">
              Smarter Health Starts Here.
            </h1>
            <p className="mx-auto mt-5 max-w-2xl text-lg text-muted-foreground">
              Cure AI is a modern healthcare management platform that helps you organize medicines,
              appointments and health records — beautifully simple, secure, and built for everyday life.
            </p>
            <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
              <Button asChild size="lg">
                <Link to="/auth" search={{ mode: "signup" }}>
                  Get Started <ArrowRight className="ml-1 h-4 w-4" />
                </Link>
              </Button>
              <Button asChild variant="outline" size="lg">
                <Link to="/about">Learn More</Link>
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="font-display text-3xl font-bold sm:text-4xl">Everything you need, organized.</h2>
          <p className="mt-3 text-muted-foreground">A complete healthcare workspace, designed for clarity.</p>
        </div>
        <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {features.map(({ icon: Icon, title, desc }) => (
            <Card key={title} className="border-border/60 shadow-soft transition-all hover:-translate-y-0.5 hover:shadow-card">
              <CardContent className="p-6">
                <div className="grid h-11 w-11 place-items-center rounded-xl bg-primary/10 text-primary">
                  <Icon className="h-5 w-5" />
                </div>
                <h3 className="mt-4 font-display text-lg font-semibold">{title}</h3>
                <p className="mt-2 text-sm text-muted-foreground">{desc}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      {/* Benefits */}
      <section className="bg-card">
        <div className="mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="font-display text-3xl font-bold sm:text-4xl">Why Cure AI</h2>
            <p className="mt-3 text-muted-foreground">Crafted to make healthcare management feel effortless.</p>
          </div>
          <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {benefits.map(({ icon: Icon, title, desc }) => (
              <div key={title} className="rounded-2xl border border-border bg-background p-6 shadow-soft">
                <div className="grid h-10 w-10 place-items-center rounded-lg bg-secondary/10 text-secondary">
                  <Icon className="h-5 w-5" />
                </div>
                <h3 className="mt-4 font-semibold">{title}</h3>
                <p className="mt-1 text-sm text-muted-foreground">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="font-display text-3xl font-bold sm:text-4xl">How it works</h2>
          <p className="mt-3 text-muted-foreground">Three simple steps to get started.</p>
        </div>
        <ol className="mt-12 grid gap-6 md:grid-cols-3">
          {[
            { step: "1", title: "Create an account", desc: "Sign up with your email in seconds." },
            { step: "2", title: "Set up your profile", desc: "Add your basic health information so everything's in one place." },
            { step: "3", title: "Manage your healthcare", desc: "Track medicines, appointments and records from one dashboard." },
          ].map((s) => (
            <li key={s.step} className="rounded-2xl border border-border bg-card p-6 shadow-soft">
              <div className="grid h-10 w-10 place-items-center rounded-full gradient-primary font-display font-bold text-primary-foreground">
                {s.step}
              </div>
              <h3 className="mt-4 font-display text-lg font-semibold">{s.title}</h3>
              <p className="mt-1 text-sm text-muted-foreground">{s.desc}</p>
            </li>
          ))}
        </ol>
      </section>

      {/* Testimonials */}
      <section className="bg-card">
        <div className="mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="font-display text-3xl font-bold sm:text-4xl">Loved by patients and providers</h2>
          </div>
          <div className="mt-12 grid gap-6 md:grid-cols-3">
            {testimonials.map((t) => (
              <Card key={t.name} className="border-border/60 shadow-soft">
                <CardContent className="p-6">
                  <p className="text-sm leading-relaxed text-foreground">"{t.quote}"</p>
                  <div className="mt-5 flex items-center gap-3">
                    <div className="grid h-10 w-10 place-items-center rounded-full gradient-primary font-display font-semibold text-primary-foreground">
                      {t.name.charAt(0)}
                    </div>
                    <div>
                      <p className="text-sm font-semibold">{t.name}</p>
                      <p className="text-xs text-muted-foreground">{t.role}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="mx-auto max-w-3xl px-4 py-20 sm:px-6 lg:px-8">
        <div className="text-center">
          <h2 className="font-display text-3xl font-bold sm:text-4xl">Frequently asked questions</h2>
        </div>
        <Accordion type="single" collapsible className="mt-10">
          {faqs.map((f, i) => (
            <AccordionItem key={f.q} value={`item-${i}`}>
              <AccordionTrigger className="text-left">{f.q}</AccordionTrigger>
              <AccordionContent className="text-muted-foreground">{f.a}</AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </section>

      {/* CTA */}
      <section className="mx-auto max-w-7xl px-4 pb-20 sm:px-6 lg:px-8">
        <div className="rounded-3xl gradient-primary p-10 text-center text-primary-foreground shadow-glow sm:p-16">
          <h2 className="font-display text-3xl font-bold sm:text-4xl">Ready to take control of your health?</h2>
          <p className="mx-auto mt-3 max-w-xl text-white/85">Create your free Cure AI account and get organized today.</p>
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            <Button asChild size="lg" variant="secondary">
              <Link to="/auth" search={{ mode: "signup" }}>
                Get Started <CheckCircle2 className="ml-1 h-4 w-4" />
              </Link>
            </Button>
          </div>
        </div>
      </section>
    </SiteLayout>
  );
}
