import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { z } from "zod";
import { Mail, Phone, MapPin, CheckCircle2, Loader2 } from "lucide-react";
import { SiteLayout } from "@/components/site/SiteLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";

export const Route = createFileRoute("/contact")({
  head: () => ({
    meta: [
      { title: "Contact — Cure AI" },
      { name: "description", content: "Get in touch with the Cure AI team." },
      { property: "og:title", content: "Contact Cure AI" },
      { property: "og:description", content: "We'd love to hear from you." },
    ],
  }),
  component: ContactPage,
});

const schema = z.object({
  name: z.string().trim().min(1).max(100),
  email: z.string().trim().email().max(255),
  subject: z.string().trim().min(1).max(150),
  message: z.string().trim().min(1).max(2000),
});

function ContactPage() {
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const parsed = schema.safeParse(Object.fromEntries(fd));
    if (!parsed.success) {
      toast.error(parsed.error.issues[0]?.message ?? "Please fill all fields correctly.");
      return;
    }
    setLoading(true);
    await new Promise((r) => setTimeout(r, 600));
    setLoading(false);
    setSent(true);
    toast.success("Message sent — we'll get back to you soon.");
  }

  return (
    <SiteLayout>
      <section className="gradient-hero">
        <div className="mx-auto max-w-4xl px-4 py-20 text-center sm:px-6 lg:px-8">
          <h1 className="font-display text-4xl font-bold sm:text-5xl">Get in touch</h1>
          <p className="mx-auto mt-4 max-w-xl text-lg text-muted-foreground">
            Questions, feedback, or partnership ideas — we'd love to hear from you.
          </p>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6 lg:px-8">
        <div className="grid gap-10 lg:grid-cols-[1fr_1.2fr]">
          <div className="space-y-6">
            <div className="rounded-2xl border border-border bg-card p-6 shadow-soft">
              <h3 className="font-display text-lg font-semibold">Company</h3>
              <ul className="mt-4 space-y-3 text-sm text-muted-foreground">
                <li className="flex items-start gap-3"><Mail className="mt-0.5 h-4 w-4 text-primary" /> hello@cureai.example</li>
                <li className="flex items-start gap-3"><Phone className="mt-0.5 h-4 w-4 text-primary" /> +1 (555) 010-2024</li>
                <li className="flex items-start gap-3"><MapPin className="mt-0.5 h-4 w-4 text-primary" /> 100 Wellness Way, Suite 200<br />San Francisco, CA</li>
              </ul>
            </div>

            <div className="overflow-hidden rounded-2xl border border-border bg-muted shadow-soft">
              <div className="grid aspect-[4/3] place-items-center text-sm text-muted-foreground">
                <div className="text-center">
                  <MapPin className="mx-auto h-8 w-8 text-primary" />
                  <p className="mt-2">Map placeholder</p>
                </div>
              </div>
            </div>

            <p className="text-sm text-muted-foreground">
              Looking for answers fast? Check the <Link to="/" hash="faq" className="font-medium text-primary hover:underline">FAQ on our homepage</Link>.
            </p>
          </div>

          <div className="rounded-2xl border border-border bg-card p-8 shadow-soft">
            {sent ? (
              <div className="grid place-items-center py-16 text-center">
                <div className="grid h-14 w-14 place-items-center rounded-full bg-success/10 text-success">
                  <CheckCircle2 className="h-7 w-7" />
                </div>
                <h2 className="mt-4 font-display text-2xl font-bold">Thanks for reaching out!</h2>
                <p className="mt-2 max-w-sm text-muted-foreground">
                  We've received your message and will be in touch shortly.
                </p>
                <Button variant="outline" className="mt-6" onClick={() => setSent(false)}>Send another</Button>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="name">Name</Label>
                    <Input id="name" name="name" required maxLength={100} />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="email">Email</Label>
                    <Input id="email" name="email" type="email" required maxLength={255} />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="subject">Subject</Label>
                  <Input id="subject" name="subject" required maxLength={150} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="message">Message</Label>
                  <Textarea id="message" name="message" rows={6} required maxLength={2000} />
                </div>
                <Button type="submit" size="lg" className="w-full" disabled={loading}>
                  {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Send message
                </Button>
              </form>
            )}
          </div>
        </div>
      </section>
    </SiteLayout>
  );
}
