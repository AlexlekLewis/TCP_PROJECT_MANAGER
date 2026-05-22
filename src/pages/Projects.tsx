import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Archive, ArchiveRestore, MoreVertical, Pencil, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  useArchiveProject,
  useDeleteProject,
  useProjectCanDelete,
  useProjects,
} from '@/hooks/useProjects';
import { useAuth } from '@/context/AuthContext';
import { ProjectForm } from '@/components/features/ProjectForm';
import { ConfirmDialog } from '@/components/features/ConfirmDialog';
import { formatCurrency } from '@/lib/currency';
import { useCanSeeFinancials } from '@/lib/permissions';
import type { Project, ProjectStatus } from '@/types/db';

type PendingAction =
  | { kind: 'delete'; project: Project }
  | { kind: 'archive'; project: Project }
  | { kind: 'unarchive'; project: Project };

export default function ProjectsPage() {
  const { data: projects = [] } = useProjects();
  const { role } = useAuth();
  const canSeeFinancials = useCanSeeFinancials();
  const [filter, setFilter] = useState<ProjectStatus | 'all'>('active');
  const [newOpen, setNewOpen] = useState(false);
  const [editing, setEditing] = useState<Project | null>(null);
  const [pending, setPending] = useState<PendingAction | null>(null);

  const archive = useArchiveProject();
  const del = useDeleteProject();

  const filtered = filter === 'all' ? projects : projects.filter((p) => p.status === filter);
  const isAdmin = role === 'admin';
  const working = archive.isPending || del.isPending;

  const runPending = async () => {
    if (!pending) return;
    try {
      if (pending.kind === 'archive') {
        await archive.archive(pending.project.id);
        toast.success(`Archived ${pending.project.name}`);
      } else if (pending.kind === 'unarchive') {
        await archive.unarchive(pending.project.id);
        toast.success(`Restored ${pending.project.name} to active`);
      } else {
        await del.mutateAsync(pending.project.id);
        toast.success(`Deleted ${pending.project.name}`);
      }
      setPending(null);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Action failed');
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="text-xl font-semibold tracking-tight">Projects</h1>
        <Select value={filter} onValueChange={(v) => setFilter(v as ProjectStatus | 'all')}>
          <SelectTrigger className="ml-auto w-36">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="complete">Complete</SelectItem>
            <SelectItem value="archived">Archived</SelectItem>
            <SelectItem value="all">All</SelectItem>
          </SelectContent>
        </Select>
        <Button onClick={() => setNewOpen(true)}>
          <Plus className="h-4 w-4" /> {isAdmin ? 'New project' : 'New draft'}
        </Button>
      </div>

      {filtered.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            No projects in this view.
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {filtered.map((p) => (
            <ProjectCard
              key={p.id}
              project={p}
              canSeeFinancials={canSeeFinancials}
              isAdmin={isAdmin}
              onEdit={() => setEditing(p)}
              onArchive={() => setPending({ kind: 'archive', project: p })}
              onUnarchive={() => setPending({ kind: 'unarchive', project: p })}
              onDelete={() => setPending({ kind: 'delete', project: p })}
            />
          ))}
        </div>
      )}

      <ProjectForm open={newOpen} onClose={() => setNewOpen(false)} />
      <ProjectForm
        open={!!editing}
        onClose={() => setEditing(null)}
        project={editing ?? undefined}
      />

      <ConfirmDialog
        open={pending?.kind === 'archive'}
        title={pending?.kind === 'archive' ? `Archive ${pending.project.name}?` : ''}
        description="Archived projects are hidden from Active but stay in the system. All time and material entries are preserved."
        confirmLabel="Archive"
        onConfirm={runPending}
        onClose={() => setPending(null)}
        loading={working}
      />
      <ConfirmDialog
        open={pending?.kind === 'unarchive'}
        title={pending?.kind === 'unarchive' ? `Restore ${pending.project.name}?` : ''}
        description="Moves the project back to Active."
        confirmLabel="Restore"
        onConfirm={runPending}
        onClose={() => setPending(null)}
        loading={working}
      />
      <ConfirmDialog
        open={pending?.kind === 'delete'}
        title={pending?.kind === 'delete' ? `Delete ${pending.project.name}?` : ''}
        description="This permanently removes the project. Only available when the project has no time or material entries. Otherwise use Archive."
        confirmLabel="Delete permanently"
        destructive
        onConfirm={runPending}
        onClose={() => setPending(null)}
        loading={working}
      />
    </div>
  );
}

function ProjectCard({
  project: p,
  canSeeFinancials,
  isAdmin,
  onEdit,
  onArchive,
  onUnarchive,
  onDelete,
}: {
  project: Project;
  canSeeFinancials: boolean;
  isAdmin: boolean;
  onEdit: () => void;
  onArchive: () => void;
  onUnarchive: () => void;
  onDelete: () => void;
}) {
  const canDelete = useProjectCanDelete(p.id);
  return (
    <Card
      data-testid={`project-card-${p.id}`}
      className="overflow-hidden border-l-4 transition-shadow hover:shadow-md"
      style={{ borderLeftColor: p.color_tag ?? 'hsl(var(--border))' }}
    >
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-2">
          <CardTitle className="truncate text-base">{p.name}</CardTitle>
          <div className="flex shrink-0 items-center gap-1">
            {p.needs_admin_review && isAdmin && (
              <Badge
                variant="default"
                className="border-amber-400 bg-amber-100 text-amber-900 hover:bg-amber-100 dark:border-amber-700 dark:bg-amber-900 dark:text-amber-100"
                title="Manager-created draft awaiting admin review"
              >
                review
              </Badge>
            )}
            <Badge variant={statusVariant(p.status)}>{p.status}</Badge>
            {isAdmin && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    aria-label="Project actions"
                  >
                    <MoreVertical className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onSelect={onEdit}>
                    <Pencil className="h-4 w-4" /> Edit
                  </DropdownMenuItem>
                  {p.status === 'archived' ? (
                    <DropdownMenuItem onSelect={onUnarchive}>
                      <ArchiveRestore className="h-4 w-4" /> Restore to active
                    </DropdownMenuItem>
                  ) : (
                    <DropdownMenuItem onSelect={onArchive}>
                      <Archive className="h-4 w-4" /> Archive
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    destructive
                    disabled={canDelete !== true}
                    onSelect={canDelete === true ? onDelete : undefined}
                  >
                    <Trash2 className="h-4 w-4" />
                    {canDelete === undefined
                      ? 'Delete (checking…)'
                      : canDelete
                        ? 'Delete permanently'
                        : 'Delete (has entries)'}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          {p.client_name ?? '—'}
          {p.address && ` · ${p.address}`}
        </p>
      </CardHeader>
      <CardContent className="flex items-end justify-between pt-0">
        <div className="space-y-0.5 text-xs">
          {canSeeFinancials && (
            <div>
              <span className="text-muted-foreground">Quote </span>
              <span className="font-semibold tabular-nums">
                {formatCurrency(p.quoted_price, { whole: true })}
              </span>
            </div>
          )}
          <div>
            <span className="text-muted-foreground">Hours </span>
            <span className="font-semibold tabular-nums">{p.quoted_hours ?? '—'}</span>
          </div>
        </div>
        <Button variant="secondary" size="sm" asChild>
          <Link to={`/projects/${p.id}`}>Open</Link>
        </Button>
      </CardContent>
    </Card>
  );
}

function statusVariant(s: ProjectStatus) {
  switch (s) {
    case 'active':
      return 'default' as const;
    case 'complete':
      return 'success' as const;
    case 'archived':
      return 'secondary' as const;
  }
}
