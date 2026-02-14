import { useState, useEffect } from 'react';
import { api } from '@/lib/api';
import type { Category, CategoryTree } from '@expense/shared';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { collectCategoryTreeIds, normalizeCategoryTree } from '@/lib/category-tree';
import {
  Plus,
  Pencil,
  Trash2,
  ChevronRight,
  ChevronDown,
  FolderTree,
} from 'lucide-react';

export function CategoriesPage() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [tree, setTree] = useState<CategoryTree[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Edit/Create state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [formName, setFormName] = useState('');
  const [formColor, setFormColor] = useState('#3b82f6');
  const [formIcon, setFormIcon] = useState('');
  const [formParentId, setFormParentId] = useState('');
  const [formErrors, setFormErrors] = useState<{ name?: string }>({});
  const [formSubmitError, setFormSubmitError] = useState<string | null>(null);

  // Expanded state for tree
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const fetchCategories = async () => {
    setIsLoading(true);
    try {
      const result = await api.getCategories();
      setCategories(result.categories);
      setTree(normalizeCategoryTree(result.tree));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch categories');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchCategories();
  }, []);

  const toggleExpand = (id: string) => {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const startCreate = (parentId = '') => {
    setIsCreating(true);
    setEditingId(null);
    setFormName('');
    setFormColor('#3b82f6');
    setFormIcon('');
    setFormParentId(parentId);
    setFormErrors({});
    setFormSubmitError(null);
    if (parentId) {
      setExpanded((prev) => {
        const next = new Set(prev);
        next.add(parentId);
        return next;
      });
    }
  };

  const startEdit = (cat: Category) => {
    setEditingId(cat.id);
    setIsCreating(false);
    setFormName(cat.name);
    setFormColor(cat.color || '#3b82f6');
    setFormIcon(cat.icon || '');
    setFormParentId(cat.parent_id || '');
    setFormErrors({});
    setFormSubmitError(null);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setIsCreating(false);
    setFormName('');
    setFormColor('#3b82f6');
    setFormIcon('');
    setFormParentId('');
    setFormErrors({});
    setFormSubmitError(null);
  };

  const handleSave = async () => {
    setFormSubmitError(null);
    const trimmedName = formName.trim();
    if (!trimmedName) {
      setFormErrors({ name: 'Name is required' });
      return;
    }
    setFormErrors({});

    try {
      if (isCreating) {
        await api.createCategory({
          name: trimmedName,
          color: formColor,
          icon: formIcon || undefined,
          parent_id: formParentId || undefined,
        });
      } else if (editingId) {
        await api.updateCategory(editingId, {
          name: trimmedName,
          color: formColor,
          icon: formIcon || undefined,
          parent_id: formParentId || undefined,
        });
      }
      cancelEdit();
      fetchCategories();
    } catch (err) {
      setFormSubmitError(err instanceof Error ? err.message : 'Failed to save category');
    }
  };

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`Delete "${name}"? Transactions will become uncategorized.`)) {
      return;
    }
    try {
      await api.deleteCategory(id);
      fetchCategories();
    } catch (err) {
      console.error('Failed to delete category:', err);
    }
  };

  const renderCategoryItem = (node: CategoryTree, level = 0) => {
    const hasChildren = node.children.length > 0;
    const isExpanded = expanded.has(node.id);
    const isEditing = editingId === node.id;

    return (
      <div key={node.id}>
        <div
          className="flex items-center gap-2 py-2 px-3 hover:bg-white/5 rounded-lg transition-colors"
          style={{ paddingLeft: `${level * 24 + 12}px` }}
        >
          {hasChildren ? (
            <button
              onClick={() => toggleExpand(node.id)}
              className="p-1 hover:bg-white/10 rounded"
            >
              {isExpanded ? (
                <ChevronDown className="h-4 w-4 text-white/45" />
              ) : (
                <ChevronRight className="h-4 w-4 text-white/45" />
              )}
            </button>
          ) : (
            <div className="w-6" />
          )}

          <div
            className="h-6 w-6 rounded flex items-center justify-center text-white text-xs"
            style={{ backgroundColor: node.color || '#6b7280' }}
          >
            {node.icon || node.name.charAt(0)}
          </div>

          {isEditing ? (
            <div className="flex-1 space-y-1">
              <div className="flex items-center gap-2">
                <Input
                  type="text"
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  className="h-8"
                  placeholder="Category name"
                />
                <input
                  type="color"
                  value={formColor}
                  onChange={(e) => setFormColor(e.target.value)}
                  className="h-8 w-8 rounded cursor-pointer"
                />
                <Button size="sm" onClick={handleSave}>
                  Save
                </Button>
                <Button size="sm" variant="outline" onClick={cancelEdit}>
                  Cancel
                </Button>
              </div>
              {formErrors.name && (
                <p className="text-xs text-red-600">{formErrors.name}</p>
              )}
              {formSubmitError && (
                <p className="text-xs text-red-600">{formSubmitError}</p>
              )}
            </div>
          ) : (
            <>
              <span className="flex-1 font-medium">{node.name}</span>
              {node.transaction_count !== undefined && (
                <Badge variant="secondary" className="text-xs">
                  {node.transaction_count} transactions
                </Badge>
              )}
              <div className="flex items-center gap-1">
                <button
                  onClick={() => startCreate(node.id)}
                  className="p-1 hover:bg-white/10 rounded"
                  title="Add subcategory"
                >
                  <Plus className="h-4 w-4 text-white/45" />
                </button>
                <button
                  onClick={() => startEdit(node)}
                  className="p-1 hover:bg-white/10 rounded"
                >
                  <Pencil className="h-4 w-4 text-white/45" />
                </button>
                <button
                  onClick={() => handleDelete(node.id, node.name)}
                  className="p-1 hover:bg-red-100 rounded"
                >
                  <Trash2 className="h-4 w-4 text-red-400" />
                </button>
              </div>
            </>
          )}
        </div>

        {hasChildren && isExpanded && (
          <div>
            {node.children.map((child: CategoryTree) => renderCategoryItem(child, level + 1))}
          </div>
        )}
        {!hasChildren && isExpanded && (
          <div style={{ paddingLeft: `${(level + 1) * 24 + 12}px` }} className="py-1 text-xs text-white/45">
            No subcategories yet
          </div>
        )}
      </div>
    );
  };

  useEffect(() => {
    const validIds = collectCategoryTreeIds(tree);
    setExpanded((prev) => {
      const next = new Set<string>();
      for (const id of prev) {
        if (validIds.has(id)) next.add(id);
      }
      return next;
    });
  }, [tree]);

  if (isLoading) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold">Categories</h1>
        <Card>
          <CardContent className="pt-6">
            <div className="space-y-3">
              {[1, 2, 3, 4, 5].map((i) => (
                <div key={i} className="flex items-center gap-3">
                  <Skeleton className="h-6 w-6 rounded" />
                  <Skeleton className="h-5 w-40" />
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Categories</h1>
        <Button onClick={() => startCreate()}>
          <Plus className="h-4 w-4 mr-2" />
          New Category
        </Button>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
          {error}
        </div>
      )}

      {/* Create Form */}
      {isCreating && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">New Category</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
              <div className="sm:col-span-2">
                <label className="block text-sm font-medium text-white/80 mb-1">
                  Name
                </label>
                <Input
                  type="text"
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  placeholder="Category name"
                />
                {formErrors.name && (
                  <p className="mt-1 text-xs text-red-600">{formErrors.name}</p>
                )}
              </div>
              <div>
                <label className="block text-sm font-medium text-white/80 mb-1">
                  Color
                </label>
                <input
                  type="color"
                  value={formColor}
                  onChange={(e) => setFormColor(e.target.value)}
                  className="h-10 w-full rounded cursor-pointer"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-white/80 mb-1">
                  Parent Category
                </label>
                <select
                  value={formParentId}
                  onChange={(e) => setFormParentId(e.target.value)}
                  className="w-full h-10 px-3 border border-white/15 rounded-md focus:outline-none focus:ring-2 focus:ring-cyan-300/60"
                >
                  <option value="">None (top level)</option>
                  {categories
                    .filter((c) => !c.parent_id)
                    .map((cat) => (
                      <option key={cat.id} value={cat.id}>
                        {cat.name}
                      </option>
                    ))}
                </select>
              </div>
            </div>
            {formSubmitError && (
              <div className="mt-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                {formSubmitError}
              </div>
            )}
            <div className="flex gap-2 mt-4">
              <Button onClick={handleSave}>
                Create
              </Button>
              <Button variant="outline" onClick={cancelEdit}>
                Cancel
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Category Tree */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FolderTree className="h-5 w-5" />
            Category Tree
          </CardTitle>
        </CardHeader>
        <CardContent>
          {tree.length > 0 ? (
            <div className="space-y-1">
              {tree.map((node) => renderCategoryItem(node))}
            </div>
          ) : (
            <p className="text-white/60 text-center py-8">
              No categories yet. Create one to get started!
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
