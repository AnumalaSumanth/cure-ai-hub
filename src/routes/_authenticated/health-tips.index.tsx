import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Lightbulb, Plus, Search, Eye, Pencil, Trash2, Star, Copy, Clock } from "lucide-react";
import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { EmptyState } from "@/components/dashboard/EmptyState";
import { supabase } from "@/integrations/supabase/client";
import { useUser } from "@/hooks/use-user";
import { toast } from "sonner";
import { readingTimeMinutes } from "@/lib/health-tips-utils";

export const Route = createFileRoute("/_authenticated/health-tips/")({
  head: () => ({ meta: [{ title: "Health Tips — Cure AI" }] }),
  component: HealthTipsPage,
});

const PAGE_SIZE = 12;

type Sort = "newest" | "oldest" | "title";

function statusVariant(status: string): "default" | "secondary" | "outline" {
  if (status === "Published") return "default";
  if (status === "Archived") return "outline";
  return "secondary";
}

function HealthTipsPage() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { user } = useUser();
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<string>("all");
  const [status, setStatus] = useState<string>("all");
  const [sort, setSort] = useState<Sort>("newest");
  const [page, setPage] = useState(1);

  const { data: tips, isLoading } = useQuery({
    queryKey: ["tips"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tips")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const categories = useMemo(() => {
    const set = new Set<string>();
    tips?.forEach((t) => t.category && set.add(t.category));
    return Array.from(set).sort();
  }, [tips]);

  const stats = useMemo(() => {
    const s = { total: 0, published: 0, draft: 0, archived: 0, featured: 0 };
    tips?.forEach((t) => {
      s.total++;
      if (t.status === "Published") s.published++;
      else if (t.status === "Draft") s.draft++;
      else if (t.status === "Archived") s.archived++;
      if (t.is_featured) s.featured++;
    });
    return s;
  }, [tips]);

  const featured = useMemo(() => tips?.find((t) => t.is_featured) ?? null, [tips]);

  const filtered = useMemo(() => {
    if (!tips) return [];
    const q = search.trim().toLowerCase();
    let list = tips.filter((t) => {
      if (t.is_featured) return false; // shown separately
      if (category !== "all" && t.category !== category) return false;
      if (status !== "all" && t.status !== status) return false;
      if (!q) return true;
      const hay = [t.title, t.category, t.content, t.target_audience, (t.tags ?? []).join(" ")]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
    if (sort === "oldest") list = [...list].sort((a, b) => a.created_at.localeCompare(b.created_at));
    else if (sort === "title") list = [...list].sort((a, b) => a.title.localeCompare(b.title));
    else list = [...list].sort((a, b) => b.created_at.localeCompare(a.created_at));
    return list;
  }, [tips, search, category, status, sort]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount);
  const paged = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  async function handleDelete(id: string) {
    const { error } = await supabase.from("tips").delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Tip deleted");
    qc.invalidateQueries({ queryKey: ["tips"] });
  }

  async function handleDuplicate(id: string) {
    if (!user) return;
    const src = tips?.find((t) => t.id === id);
    if (!src) return;
    const { data, error } = await supabase
      .from("tips")
      .insert({
        user_id: user.id,
        title: `${src.title} (Copy)`,
        category: src.category,
        content: src.content,
        target_audience: src.target_audience,
        tags: src.tags ?? [],
        status: "Draft",
        notes: src.notes,
        ai_summary: src.ai_summary,
      })
      .select("id")
      .single();
    if (error) return toast.error(error.message);
    toast.success("Tip duplicated");
    qc.invalidateQueries({ queryKey: ["tips"] });
    navigate({ to: "/health-tips/$id/edit", params: { id: data.id } });
  }

  const statCards = [
    { label: "Total", value: stats.total },
    { label: "Published", value: stats.published },
    { label: "Drafts", value: stats.draft },
    { label: "Archived", value: stats.archived },
    { label: "Featured", value: stats.featured },
  ];

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="font-display text-3xl font-bold">Health Tips</h1>
            <p className="mt-1 text-muted-foreground">
              Create, organize, and publish your personal library of health guidance.
            </p>
          </div>
          <Button asChild>
            <Link to="/health-tips/new"><Plus className="mr-2 h-4 w-4" /> Create Health Tip</Link>
          </Button>
        </div>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {statCards.map((s) => (
            <Card key={s.label} className="shadow-soft">
              <CardContent className="p-4">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{s.label}</p>
                <p className="mt-1 font-display text-2xl font-bold">{s.value}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        {featured && (
          <Card className="border-warning/40 bg-warning/5 shadow-soft">
            <CardHeader className="pb-2">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-2">
                  <Star className="h-4 w-4 fill-warning text-warning" />
                  <span className="text-xs font-medium uppercase tracking-wide text-warning">Featured tip</span>
                </div>
                <Badge variant={statusVariant(featured.status)}>{featured.status}</Badge>
              </div>
              <CardTitle className="font-display text-xl">{featured.title}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="line-clamp-2 text-sm text-muted-foreground">
                {featured.ai_summary ?? featured.content}
              </p>
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-1 text-xs text-muted-foreground">
                  <Clock className="h-3 w-3" /> {readingTimeMinutes(featured.content)} min read
                </span>
                <Button asChild size="sm" variant="outline">
                  <Link to="/health-tips/$id" params={{ id: featured.id }}>Open</Link>
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        <Card className="shadow-soft">
          <CardContent className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="relative sm:col-span-2 lg:col-span-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                placeholder="Search title, content, tags, audience…"
                className="pl-9"
              />
            </div>
            <Select value={category} onValueChange={(v) => { setCategory(v); setPage(1); }}>
              <SelectTrigger><SelectValue placeholder="Category" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All categories</SelectItem>
                {categories.map((c) => (
                  <SelectItem key={c} value={c}>{c}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={status} onValueChange={(v) => { setStatus(v); setPage(1); }}>
              <SelectTrigger><SelectValue placeholder="Status" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                <SelectItem value="Draft">Draft</SelectItem>
                <SelectItem value="Published">Published</SelectItem>
                <SelectItem value="Archived">Archived</SelectItem>
              </SelectContent>
            </Select>
            <Select value={sort} onValueChange={(v) => setSort(v as Sort)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="newest">Newest first</SelectItem>
                <SelectItem value="oldest">Oldest first</SelectItem>
                <SelectItem value="title">Title (A–Z)</SelectItem>
              </SelectContent>
            </Select>
          </CardContent>
        </Card>

        {isLoading ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-48 w-full rounded-2xl" />
            ))}
          </div>
        ) : filtered.length === 0 && !featured ? (
          tips && tips.length > 0 ? (
            <EmptyState
              icon={Lightbulb}
              title="No tips match your filters"
              description="Try clearing the search or changing the filters."
            />
          ) : (
            <EmptyState
              icon={Lightbulb}
              title="No health tips yet"
              description="Create your first health tip to build your personal knowledge library."
              actionLabel="Create Health Tip"
              actionTo="/health-tips/new"
            />
          )
        ) : (
          <>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {paged.map((t) => (
                <Card key={t.id} className="flex flex-col shadow-soft transition-shadow hover:shadow-card">
                  <CardHeader className="pb-2">
                    <div className="flex items-start justify-between gap-2">
                      <CardTitle className="font-display text-lg leading-snug">{t.title}</CardTitle>
                      <Badge variant={statusVariant(t.status)}>{t.status}</Badge>
                    </div>
                    {t.category && (
                      <p className="text-xs text-muted-foreground">{t.category}</p>
                    )}
                  </CardHeader>
                  <CardContent className="flex flex-1 flex-col justify-between gap-4">
                    <p className="line-clamp-3 text-sm text-muted-foreground">
                      {t.ai_summary ?? t.content}
                    </p>
                    {t.tags && t.tags.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {t.tags.slice(0, 5).map((tag) => (
                          <Badge key={tag} variant="outline" className="text-xs font-normal">{tag}</Badge>
                        ))}
                      </div>
                    )}
                    <div className="flex items-center justify-between border-t border-border pt-3">
                      <span className="flex items-center gap-1 text-xs text-muted-foreground">
                        <Clock className="h-3 w-3" /> {readingTimeMinutes(t.content)} min read
                      </span>
                      <div className="flex items-center gap-1">
                        <Button asChild variant="ghost" size="icon" aria-label="View">
                          <Link to="/health-tips/$id" params={{ id: t.id }}><Eye className="h-4 w-4" /></Link>
                        </Button>
                        <Button asChild variant="ghost" size="icon" aria-label="Edit">
                          <Link to="/health-tips/$id/edit" params={{ id: t.id }}><Pencil className="h-4 w-4" /></Link>
                        </Button>
                        <Button variant="ghost" size="icon" aria-label="Duplicate" onClick={() => handleDuplicate(t.id)}>
                          <Copy className="h-4 w-4" />
                        </Button>
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button variant="ghost" size="icon" aria-label="Delete">
                              <Trash2 className="h-4 w-4 text-muted-foreground" />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Delete this tip?</AlertDialogTitle>
                              <AlertDialogDescription>
                                "{t.title}" will be permanently removed. This cannot be undone.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancel</AlertDialogCancel>
                              <AlertDialogAction onClick={() => handleDelete(t.id)}>Delete</AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>

            {pageCount > 1 && (
              <div className="flex items-center justify-center gap-2 pt-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={currentPage === 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                >
                  Previous
                </Button>
                <span className="text-sm text-muted-foreground">
                  Page {currentPage} of {pageCount}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={currentPage === pageCount}
                  onClick={() => setPage((p) => Math.min(pageCount, p + 1))}
                >
                  Next
                </Button>
              </div>
            )}
          </>
        )}
      </div>
    </DashboardLayout>
  );
}
