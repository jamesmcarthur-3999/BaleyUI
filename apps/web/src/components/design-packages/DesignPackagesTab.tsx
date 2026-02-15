'use client';

import { useState } from 'react';
import { trpc } from '@/lib/trpc/client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useToast } from '@/components/ui/use-toast';
import { DesignCalibrationWizard } from './DesignCalibrationWizard';
import { DesignPreview } from './DesignPreview';
import type { DesignPackageData } from '@/lib/design-packages/types';
import {
  Plus,
  Palette,
  Eye,
  Pencil,
  Trash2,
  Star,
  MoreHorizontal,
  Download,
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

export function DesignPackagesTab() {
  const { toast } = useToast();
  const utils = trpc.useUtils();
  const { data: packages, isLoading } = trpc.designPackages.list.useQuery();
  const deleteMutation = trpc.designPackages.delete.useMutation({
    onSuccess: () => {
      utils.designPackages.list.invalidate();
      toast({ title: 'Design package deleted' });
    },
  });
  const setDefaultMutation = trpc.designPackages.setDefault.useMutation({
    onSuccess: () => {
      utils.designPackages.list.invalidate();
      toast({ title: 'Default design package updated' });
    },
  });

  const [wizardOpen, setWizardOpen] = useState(false);
  const [editingPackage, setEditingPackage] = useState<{
    id: string;
    name: string;
    description: string | null;
    packageData: DesignPackageData;
  } | null>(null);
  const [previewPackage, setPreviewPackage] = useState<{
    name: string;
    packageData: DesignPackageData;
  } | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const handleWizardComplete = () => {
    setWizardOpen(false);
    setEditingPackage(null);
    utils.designPackages.list.invalidate();
    toast({ title: editingPackage ? 'Design package updated' : 'Design package created' });
  };

  const downloadFile = (filename: string, content: string) => {
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  const downloadBase64File = (filename: string, base64: string, mimeType: string) => {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) {
      bytes[i] = binary.charCodeAt(i);
    }
    const blob = new Blob([bytes], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleExport = async (
    id: string,
    format: 'css' | 'tailwind' | 'json' | 'blueprints' | 'bundle'
  ) => {
    try {
      if (format === 'bundle') {
        const result = await utils.designPackages.exportBundle.fetch({ id });
        downloadBase64File(result.filename, result.base64, result.contentType);
      } else {
        const procedure = format === 'css'
          ? utils.designPackages.exportCSS
          : format === 'tailwind'
            ? utils.designPackages.exportTailwind
            : format === 'blueprints'
              ? utils.designPackages.exportBlueprints
              : utils.designPackages.exportJSON;
        const result = await procedure.fetch({ id });
        downloadFile(result.filename, result.content);
      }
      toast({ title: `Exported as ${format === 'bundle' ? 'BUNDLE' : format.toUpperCase()}` });
    } catch {
      toast({ title: 'Export failed', variant: 'destructive' });
    }
  };

  if (isLoading) {
    return (
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 p-1">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-48 rounded-xl" />
        ))}
      </div>
    );
  }

  if (!packages || packages.length === 0) {
    return (
      <>
        <EmptyState
          icon={Palette}
          title="No design packages yet"
          description="Design packages instantly retheme your entire app — colors, typography, spacing, and animations. Upload brand assets or start from a preset."
          action={{
            label: 'Create Your First Design',
            onClick: () => setWizardOpen(true),
          }}
        />

        <Dialog open={wizardOpen} onOpenChange={setWizardOpen}>
          <DialogContent size="xl" className="flex flex-col h-[85vh] max-h-[900px] max-w-7xl p-0 overflow-hidden [&>button.absolute]:hidden">
            <DialogTitle className="sr-only">Design Calibration</DialogTitle>
            <DesignCalibrationWizard
              onComplete={handleWizardComplete}
              onSkip={() => setWizardOpen(false)}
            />
          </DialogContent>
        </Dialog>
      </>
    );
  }

  return (
    <>
      {/* Header */}
      <div className="mb-4 flex items-center justify-between">
        <div className="text-sm text-muted-foreground">
          {packages.length} design package{packages.length !== 1 ? 's' : ''}
        </div>
        <Button size="sm" onClick={() => setWizardOpen(true)} className="gap-1.5">
          <Plus className="h-3.5 w-3.5" />
          New Package
        </Button>
      </div>

      {/* Package Grid */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {packages.map((pkg) => {
          const data = pkg.packageData as DesignPackageData;
          return (
            <div
              key={pkg.id}
              className="group relative rounded-xl border border-border bg-card p-4 transition-all duration-200 hover:border-primary/30 hover:shadow-md"
            >
              {/* Color swatch strip */}
              <div className="mb-3 flex gap-0.5 rounded-lg overflow-hidden">
                {[
                  data.colors.light.primary,
                  data.colors.light.secondary,
                  data.colors.light.accent,
                  data.colors.light.muted,
                  data.colors.light.background,
                ].map((color, i) => (
                  <div
                    key={i}
                    className="h-8 flex-1"
                    style={{ backgroundColor: `hsl(${color})` }}
                  />
                ))}
              </div>

              {/* Name and badges */}
              <div className="flex items-start justify-between">
                <div>
                  <div className="font-medium text-sm">{pkg.name}</div>
                  {pkg.description && (
                    <div className="mt-0.5 text-xs text-muted-foreground line-clamp-2">
                      {pkg.description}
                    </div>
                  )}
                </div>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 w-7 p-0 opacity-0 transition-opacity group-hover:opacity-100"
                    >
                      <MoreHorizontal className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem
                      onClick={() =>
                        setPreviewPackage({ name: pkg.name, packageData: data })
                      }
                    >
                      <Eye className="h-4 w-4 mr-2" />
                      Preview
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() =>
                        setEditingPackage({
                          id: pkg.id,
                          name: pkg.name,
                          description: pkg.description,
                          packageData: data,
                        })
                      }
                    >
                      <Pencil className="h-4 w-4 mr-2" />
                      Edit
                    </DropdownMenuItem>
                    {!pkg.isDefault && (
                      <DropdownMenuItem
                        onClick={() => setDefaultMutation.mutate({ id: pkg.id })}
                      >
                        <Star className="h-4 w-4 mr-2" />
                        Set as Default
                      </DropdownMenuItem>
                    )}
                    <DropdownMenuItem onClick={() => handleExport(pkg.id, 'css')}>
                      <Download className="h-4 w-4 mr-2" />
                      Export CSS
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => handleExport(pkg.id, 'tailwind')}>
                      <Download className="h-4 w-4 mr-2" />
                      Export Tailwind
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => handleExport(pkg.id, 'json')}>
                      <Download className="h-4 w-4 mr-2" />
                      Export JSON
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => handleExport(pkg.id, 'blueprints')}>
                      <Download className="h-4 w-4 mr-2" />
                      Export Blueprints
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => handleExport(pkg.id, 'bundle')}>
                      <Download className="h-4 w-4 mr-2" />
                      Export Artifact Bundle
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() => setDeleteId(pkg.id)}
                      className="text-destructive"
                    >
                      <Trash2 className="h-4 w-4 mr-2" />
                      Delete
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>

              {/* Footer badges */}
              <div className="mt-3 flex items-center gap-2">
                {pkg.isDefault && (
                  <Badge variant="outline" className="border-primary/30 text-primary text-[10px]">
                    <Star className="h-2.5 w-2.5 mr-1 fill-current" />
                    Default
                  </Badge>
                )}
                <Badge variant="outline" className="text-[10px] capitalize">
                  {(data.mood)}
                </Badge>
                <span className="text-[10px] text-muted-foreground ml-auto">
                  v{pkg.version}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Create/Edit Dialog */}
      <Dialog
        open={wizardOpen || !!editingPackage}
        onOpenChange={(open) => {
          if (!open) {
            setWizardOpen(false);
            setEditingPackage(null);
          }
        }}
      >
        <DialogContent size="xl" className="flex flex-col h-[85vh] max-h-[900px] max-w-7xl p-0 overflow-hidden [&>button.absolute]:hidden">
          <DialogTitle className="sr-only">
            {editingPackage ? 'Edit Design Package' : 'Create Design Package'}
          </DialogTitle>
          <DesignCalibrationWizard
            onComplete={handleWizardComplete}
            onSkip={() => {
              setWizardOpen(false);
              setEditingPackage(null);
            }}
            existingPackage={editingPackage ?? undefined}
          />
        </DialogContent>
      </Dialog>

      {/* Preview Dialog */}
      <Dialog open={!!previewPackage} onOpenChange={(open) => !open && setPreviewPackage(null)}>
        <DialogContent size="xl" className="h-[85vh] max-h-[900px] max-w-5xl p-6 overflow-y-auto">
          {previewPackage && (
            <>
              <DialogTitle className="mb-4 text-lg font-semibold">{previewPackage.name}</DialogTitle>
              <DesignPreview data={previewPackage.packageData} />
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteId} onOpenChange={(open) => !open && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete design package?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. The design package will be permanently removed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (deleteId) {
                  deleteMutation.mutate({ id: deleteId });
                  setDeleteId(null);
                }
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
