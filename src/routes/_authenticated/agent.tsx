import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Bot, Send, ShieldAlert, ShieldCheck, User as UserIcon } from "lucide-react";
import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { AgentActionCenter, AgentActivityLog } from "@/components/dashboard/AgentPanels";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { askHealthAgent } from "@/lib/agent.functions";
import type { AgentActivityEntry, AgentResponse, PendingAction } from "@/agents/cure-agent/types";

export const Route = createFileRoute("/_authenticated/agent")({
  head: () => ({
    meta: [
      { title: "Cure AI Agent — Health Assistant" },
      {
        name: "description",
        content:
          "Chat with the Cure AI Health Agent for educational guidance on symptoms, reports, medicines, appointments and study topics.",
      },
      { property: "og:title", content: "Cure AI Agent — Health Assistant" },
      {
        property: "og:description",
        content: "Educational health guidance, reminders and study help in one assistant.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AgentPage,
});

type ChatMessage = {
  role: "user" | "assistant";
  content: string;
  meta?: Pick<AgentResponse, "safety" | "risk" | "confidence" | "sources" | "disclaimer">;
  pendingAction?: PendingAction | null;
};

const SUGGESTIONS = [
  "I have had headaches for three days.",
  "Explain HbA1c.",
  "Remind me to take Metformin at 9 PM.",
  "Create a study plan for pharmacology.",
];

const CONFIDENCE_LABEL = { low: "Low", moderate: "Moderate", high: "High" } as const;


function AgentPage() {
  const ask = useServerFn(askHealthAgent);
  const queryClient = useQueryClient();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [activity, setActivity] = useState<AgentActivityEntry[]>([]);
  const [input, setInput] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, status]);

  async function send(text: string, confirm?: PendingAction) {
    const message = text.trim();
    if (!message || status) return;
    const history = messages.map((m) => ({ role: m.role, content: m.content }));
    if (!confirm) setMessages((prev) => [...prev, { role: "user", content: message }]);
    setInput("");
    setStatus("Understanding your request...");
    try {
      const res = await ask({
        data: {
          message,
          history: history.slice(-10),
          ...(confirm
            ? { confirm: { tool: confirm.tool, confirmed: true, args: confirm.args } }
            : {}),
        },
      });
      setActivity(res.activity);
      setMessages((prev) => [
        ...prev.map((m) => (m.pendingAction ? { ...m, pendingAction: null } : m)),
        {
          role: "assistant",
          content: res.message,
          meta: {
            safety: res.safety,
            risk: res.risk,
            confidence: res.confidence,
            sources: res.sources,
            disclaimer: res.disclaimer,
          },
          pendingAction: res.pendingAction,
        },
      ]);
      if (confirm) void queryClient.invalidateQueries({ queryKey: ["agent-action-center"] });
    } catch (err) {
      console.error(err);
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: "I couldn't access that information right now. Please try again." },
      ]);
    } finally {
      setStatus(null);
      inputRef.current?.focus();
    }
  }


  return (
    <DashboardLayout>
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold">Cure AI Agent</h1>
          <p className="text-sm text-muted-foreground">
            Educational health guidance — it can also search your Medical Library, set medicine
            reminders and help with study topics.
          </p>
        </div>

        <Card>
          <CardContent className="flex h-[60vh] flex-col gap-4 overflow-y-auto p-4">
            {messages.length === 0 && (
              <div className="m-auto max-w-md space-y-3 text-center">
                <span className="mx-auto grid h-12 w-12 place-items-center rounded-2xl gradient-primary text-primary-foreground">
                  <Bot className="h-6 w-6" />
                </span>
                <p className="text-sm text-muted-foreground">
                  Ask me about symptoms, a medical term, your reports, reminders, appointments or a
                  study topic.
                </p>
                <div className="flex flex-wrap justify-center gap-2">
                  {SUGGESTIONS.map((s) => (
                    <Button key={s} variant="outline" size="sm" onClick={() => void send(s)}>
                      {s}
                    </Button>
                  ))}
                </div>
              </div>
            )}

            {messages.map((m, i) => (
              <div key={i} className={`flex gap-3 ${m.role === "user" ? "justify-end" : ""}`}>
                {m.role === "assistant" && (
                  <span className="mt-1 grid h-8 w-8 shrink-0 place-items-center rounded-lg gradient-primary text-primary-foreground">
                    <Bot className="h-4 w-4" />
                  </span>
                )}
                <div
                  className={`max-w-[85%] space-y-2 rounded-xl px-4 py-3 text-sm ${
                    m.role === "user" ? "bg-primary text-primary-foreground" : "bg-muted"
                  }`}
                >
                  {m.meta?.safety === "urgent" && (
                    <div className="flex items-center gap-2 text-destructive">
                      <ShieldAlert className="h-4 w-4" />
                      <span className="text-xs font-semibold uppercase">Urgent care advised</span>
                    </div>
                  )}
                  <div className="whitespace-pre-wrap leading-relaxed">{m.content}</div>
                  {m.meta?.sources && m.meta.sources.length > 0 && (
                    <div className="flex flex-wrap gap-1 pt-1">
                      {m.meta.sources.map((s) => (
                        <Badge key={s} variant="secondary" className="text-[10px]">
                          {s}
                        </Badge>
                      ))}
                    </div>
                  )}
                  {m.role === "assistant" && m.meta?.disclaimer && (
                    <p className="pt-1 text-[11px] text-muted-foreground">{m.meta.disclaimer}</p>
                  )}
                </div>
                {m.role === "user" && (
                  <span className="mt-1 grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-muted">
                    <UserIcon className="h-4 w-4" />
                  </span>
                )}
              </div>
            ))}

            {status && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <span className="grid h-8 w-8 place-items-center rounded-lg gradient-primary text-primary-foreground">
                  <Bot className="h-4 w-4 animate-pulse" />
                </span>
                {status}
              </div>
            )}
            <div ref={endRef} />
          </CardContent>
        </Card>

        <form
          className="flex items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void send(input);
          }}
        >
          <Textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void send(input);
              }
            }}
            placeholder="Describe how you feel, or ask a health question…"
            className="min-h-[52px] resize-none"
          />
          <Button type="submit" disabled={!input.trim() || Boolean(status)} size="icon" className="h-[52px] w-[52px]">
            <Send className="h-4 w-4" />
          </Button>
        </form>
      </div>
    </DashboardLayout>
  );
}
