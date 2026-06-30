import { createFileRoute } from "@tanstack/react-router";
import { SiteLayout } from "@/components/site/SiteLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Compass, Eye, BookOpen, Heart, Sparkles, Users } from "lucide-react";

export const Route = createFileRoute("/about")({
  head: () => ({
    meta: [
      { title: "About — Cure AI" },
      { name: "description", content: "Learn about Cure AI's mission, vision and what's next for our healthcare management platform." },
      { property: "og:title", content: "About Cure AI" },
      { property: "og:description", content: "Our mission, vision, and roadmap for smarter healthcare." },
    ],
  }),
  component: AboutPage,
});

function AboutPage() {
  const values = [
    { icon: Heart, title: "Patient first", desc: "Everything we design starts with the person using it." },
    { icon: Eye, title: "Clarity", desc: "Simple, honest interfaces that get out of your way." },
    { icon: Compass, title: "Trust", desc: "Security and privacy are foundational, not features." },
    { icon: Sparkles, title: "Forward thinking", desc: "Built to grow into intelligent, AI-powered care." },
  ];

  return (
    <SiteLayout>
      <section className="gradient-hero">
        <div className="mx-auto max-w-4xl px-4 py-20 text-center sm:px-6 lg:px-8">
          <h1 className="font-display text-4xl font-bold sm:text-5xl">About Cure AI</h1>
          <p className="mx-auto mt-4 max-w-2xl text-lg text-muted-foreground">
            We're building the calmest, clearest way to manage your healthcare — today, and as AI reshapes medicine tomorrow.
          </p>
        </div>
      </section>

      <section className="mx-auto max-w-5xl px-4 py-16 sm:px-6 lg:px-8">
        <div className="grid gap-6 md:grid-cols-2">
          <Card className="shadow-soft">
            <CardContent className="p-8">
              <div className="grid h-11 w-11 place-items-center rounded-xl bg-primary/10 text-primary"><Compass className="h-5 w-5" /></div>
              <h2 className="mt-4 font-display text-2xl font-bold">Our Mission</h2>
              <p className="mt-2 text-muted-foreground">To make personal healthcare management effortless, secure and accessible to everyone.</p>
            </CardContent>
          </Card>
          <Card className="shadow-soft">
            <CardContent className="p-8">
              <div className="grid h-11 w-11 place-items-center rounded-xl bg-secondary/10 text-secondary"><Eye className="h-5 w-5" /></div>
              <h2 className="mt-4 font-display text-2xl font-bold">Our Vision</h2>
              <p className="mt-2 text-muted-foreground">A future where every person has an intelligent, trusted companion for their health journey.</p>
            </CardContent>
          </Card>
        </div>

        <div className="mt-12 rounded-2xl border border-border bg-card p-8 shadow-soft">
          <div className="flex items-center gap-3">
            <BookOpen className="h-5 w-5 text-primary" />
            <h2 className="font-display text-2xl font-bold">Our Story</h2>
          </div>
          <p className="mt-3 text-muted-foreground">
            Cure AI began with a simple idea: the tools we use to manage our health should be as thoughtful as the care we receive.
            We started by building a clean foundation — a beautiful dashboard for medicines, appointments and records — and we'll
            layer intelligence on top in the versions to come.
          </p>
        </div>

        <div className="mt-12">
          <h2 className="font-display text-2xl font-bold">Core Values</h2>
          <div className="mt-6 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {values.map(({ icon: Icon, title, desc }) => (
              <div key={title} className="rounded-2xl border border-border bg-card p-6 shadow-soft">
                <div className="grid h-10 w-10 place-items-center rounded-lg bg-primary/10 text-primary"><Icon className="h-5 w-5" /></div>
                <h3 className="mt-3 font-semibold">{title}</h3>
                <p className="mt-1 text-sm text-muted-foreground">{desc}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-12 rounded-2xl border border-border bg-card p-8 shadow-soft">
          <div className="flex items-center gap-3">
            <Sparkles className="h-5 w-5 text-primary" />
            <h2 className="font-display text-2xl font-bold">Future Roadmap</h2>
          </div>
          <p className="mt-3 text-muted-foreground">
            Version 1 ships the foundation. Coming soon: AI symptom checker, AI health chat, report analysis,
            personalized wellness recommendations, smart medicine reminders, a voice assistant, doctor recommendations,
            and family profiles.
          </p>
        </div>

        <div className="mt-12">
          <div className="flex items-center gap-3">
            <Users className="h-5 w-5 text-primary" />
            <h2 className="font-display text-2xl font-bold">The Team</h2>
          </div>
          <div className="mt-6 grid gap-6 sm:grid-cols-3">
            {["Alex Carter", "Jordan Lee", "Sam Patel"].map((n) => (
              <div key={n} className="rounded-2xl border border-border bg-card p-6 text-center shadow-soft">
                <div className="mx-auto grid h-16 w-16 place-items-center rounded-full gradient-primary font-display text-xl font-semibold text-primary-foreground">
                  {n.charAt(0)}
                </div>
                <p className="mt-3 font-semibold">{n}</p>
                <p className="text-xs text-muted-foreground">Founding team</p>
              </div>
            ))}
          </div>
        </div>
      </section>
    </SiteLayout>
  );
}
