import { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { api } from '@/lib/api';
import type { Rule, Category, Tag } from '@expense/shared';
import { RULE_MATCH_FIELDS, RULE_MATCH_TYPES, RULE_ACTION_TYPES } from '@expense/shared';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Plus,
  Pencil,
  Trash2,
  Play,
  Workflow,
  CheckCircle,
  XCircle,
  GripVertical,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { localizeCategoryName } from '@/lib/category-localization';

type RuleTestResult = {
  ruleId: string;
  tested: number;
  matched: number;
  actionLabel: string;
  matches: Array<{
    transaction_id: string;
    description: string;
    amount: number;
    date: string;
  }>;
};

export function RulesPage() {
  const { t, i18n } = useTranslation();
  const currentLanguage = i18n.resolvedLanguage || i18n.language;
  const [rules, setRules] = useState<Rule[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [tags, setTags] = useState<Tag[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Edit/Create state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [formName, setFormName] = useState('');
  const [formField, setFormField] = useState<string>('description');
  const [formMatchType, setFormMatchType] = useState<string>('contains');
  const [formPattern, setFormPattern] = useState('');
  const [formActionType, setFormActionType] = useState<string>('set_category');
  const [formActionValue, setFormActionValue] = useState('');
  const [formPriority, setFormPriority] = useState(0);
  const [formEnabled, setFormEnabled] = useState(true);
  const [formErrors, setFormErrors] = useState<{
    name?: string;
    priority?: string;
    pattern?: string;
    actionValue?: string;
  }>({});
  const [formSubmitError, setFormSubmitError] = useState<string | null>(null);

  // Test state
  const [testText, setTestText] = useState('');
  const [testResult, setTestResult] = useState<RuleTestResult | null>(null);
  const [testingRuleId, setTestingRuleId] = useState<string | null>(null);

  // Apply state
  const [applyingRules, setApplyingRules] = useState(false);
  const [applyResult, setApplyResult] = useState<{ affected: number } | null>(null);
  const [applyStatus, setApplyStatus] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [applyPreviewCount, setApplyPreviewCount] = useState<number | null>(null);
  const location = useLocation();

  const fetchData = async () => {
    setIsLoading(true);
    try {
      const [rulesRes, catsRes, tagsRes] = await Promise.all([
        api.getRules(),
        api.getCategories(),
        api.getTags(),
      ]);
      setRules(rulesRes.rules);
      setCategories(catsRes.categories);
      setTags(tagsRes.tags);
      try {
        const txPreview = await api.getTransactions({
          include_excluded: false,
          include_transfers: true,
          limit: 1,
          offset: 0,
        });
        setApplyPreviewCount(txPreview.total);
      } catch {
        setApplyPreviewCount(null);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch data');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  useEffect(() => {
    setApplyResult(null);
    setApplyStatus(null);
    setApplyingRules(false);
  }, [location.pathname]);

  const startCreate = () => {
    setIsCreating(true);
    setEditingId(null);
    setFormName('');
    setFormField('description');
    setFormMatchType('contains');
    setFormPattern('');
    setFormActionType('set_category');
    setFormActionValue('');
    setFormPriority(Math.max(1, rules.length + 1));
    setFormEnabled(true);
    setFormErrors({});
    setFormSubmitError(null);
  };

  const startEdit = (rule: Rule) => {
    setEditingId(rule.id);
    setIsCreating(false);
    setFormName(rule.name);
    setFormField(rule.match_field);
    setFormMatchType(rule.match_type);
    setFormPattern(rule.match_value);
    setFormActionType(rule.action_type);
    setFormActionValue(rule.action_value);
    setFormPriority(rule.priority);
    setFormEnabled(rule.enabled);
    setFormErrors({});
    setFormSubmitError(null);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setIsCreating(false);
    setFormName('');
    setFormPattern('');
    setFormActionValue('');
    setFormErrors({});
    setFormSubmitError(null);
  };

  const handleSave = async () => {
    setFormSubmitError(null);
    const nextErrors: {
      name?: string;
      priority?: string;
      pattern?: string;
      actionValue?: string;
    } = {};

    const trimmedName = formName.trim();
    const trimmedPattern = formPattern.trim();
    const trimmedActionValue = formActionValue.trim();

    if (!trimmedName) nextErrors.name = 'Name is required';
    if (!Number.isFinite(formPriority) || formPriority < 1) {
      nextErrors.priority = 'Priority must be 1 or higher';
    }
    if (!trimmedPattern) nextErrors.pattern = 'Pattern is required';
    if (!trimmedActionValue) {
      nextErrors.actionValue = formActionType === 'set_category'
        ? 'Select a category'
        : formActionType === 'add_tag'
          ? 'Select a tag'
          : 'Value is required';
    }

    setFormErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    try {
      const data = {
        name: trimmedName,
        match_field: formField as Rule['match_field'],
        match_type: formMatchType as Rule['match_type'],
        match_value: trimmedPattern,
        action_type: formActionType as Rule['action_type'],
        action_value: trimmedActionValue,
        priority: formPriority,
        enabled: formEnabled,
      };

      if (isCreating) {
        await api.createRule(data);
      } else if (editingId) {
        await api.updateRule(editingId, data);
      }
      cancelEdit();
      fetchData();
    } catch (err) {
      setFormSubmitError(err instanceof Error ? err.message : 'Failed to save rule');
    }
  };

  const handleDelete = async (id: string) => {
    const rule = rules.find((r) => r.id === id);
    const ruleName = rule?.name || 'this rule';
    if (!confirm(`Delete "${ruleName}"?`)) return;
    try {
      await api.deleteRule(id);
      fetchData();
    } catch (err) {
      console.error('Failed to delete rule:', err);
    }
  };

  const getActionPreviewLabel = (rule: Rule): string => {
    if (rule.action_type === 'set_category') {
      const cat = categories.find((c) => c.id === rule.action_value);
      return `${t('rulesPage.setCategoryTo')} ${localizeCategoryName(cat?.name || rule.action_value, currentLanguage)}`;
    }
    if (rule.action_type === 'add_tag') {
      const tag = tags.find((t) => t.id === rule.action_value);
      return `${t('rulesPage.addTagTo')} ${tag?.name || rule.action_value}`;
    }
    return `${rule.action_type.replace('_', ' ')} -> ${rule.action_value}`;
  };

  const handleTest = async (ruleId: string) => {
    const rule = rules.find((r) => r.id === ruleId);
    if (!rule) return;
    setTestingRuleId(ruleId);
    try {
      const result = await api.testRule(ruleId, testText);
      const filteredMatches = testText.trim()
        ? result.matches.filter((m) =>
            m.description.toLowerCase().includes(testText.trim().toLowerCase())
          )
        : result.matches;

      setTestResult({
        ruleId,
        tested: result.tested,
        matched: filteredMatches.length,
        actionLabel: getActionPreviewLabel(rule),
        matches: filteredMatches.slice(0, 20),
      });
    } catch (err) {
      setTestResult({
        ruleId,
        tested: 0,
        matched: 0,
        actionLabel: getActionPreviewLabel(rule),
        matches: [],
      });
    } finally {
      setTestingRuleId(null);
    }
  };

  const handleApplyAll = async () => {
    const preview = applyPreviewCount != null
      ? `This will evaluate about ${applyPreviewCount} transactions. Continue?`
      : 'Apply all enabled rules to matching transactions now?';
    if (!confirm(preview)) return;

    setApplyingRules(true);
    setApplyResult(null);
    setApplyStatus(null);
    try {
      const result = await api.applyRules({ all: true });
      setApplyResult({ affected: result.updated });
      const timestamp = new Date().toLocaleTimeString('nb-NO', { hour: '2-digit', minute: '2-digit' });
      setApplyStatus({
        type: 'success',
        message: `Rules applied at ${timestamp}`,
      });
    } catch (err) {
      setApplyStatus({
        type: 'error',
        message: err instanceof Error ? err.message : 'Failed to apply rules',
      });
    } finally {
      setApplyingRules(false);
    }
  };

  const toggleEnabled = async (rule: Rule) => {
    try {
      await api.updateRule(rule.id, { enabled: !rule.enabled });
      fetchData();
    } catch (err) {
      console.error('Failed to toggle rule:', err);
    }
  };

  const getActionValueLabel = (rule: Rule) => {
    if (rule.action_type === 'set_category') {
      const cat = categories.find((c) => c.id === rule.action_value);
      return cat?.name || rule.action_value;
    }
    if (rule.action_type === 'add_tag') {
      const tag = tags.find((t) => t.id === rule.action_value);
      return tag?.name || rule.action_value;
    }
    return rule.action_value;
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold">Rules</h1>
        <Card>
          <CardContent className="pt-6">
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-20 w-full" />
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
        <h1 className="text-2xl font-bold">{t('rulesPage.title')}</h1>
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={handleApplyAll}
            disabled={applyingRules || rules.length === 0}
            title={
              applyPreviewCount != null
                ? `Will evaluate about ${applyPreviewCount} transactions`
                : 'Apply rules to all matching transactions'
            }
          >
            <Play className="h-4 w-4 mr-2" />
            {applyingRules
              ? t('rulesPage.applying')
              : applyPreviewCount != null
                ? t('rulesPage.applyAllWithCount', { count: applyPreviewCount })
                : t('rulesPage.applyAll')}
          </Button>
          <Button onClick={startCreate}>
            <Plus className="h-4 w-4 mr-2" />
            {t('rulesPage.newRule')}
          </Button>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
          {error}
        </div>
      )}

      {applyStatus && (
        <div
          className={
            applyStatus.type === 'success'
              ? 'bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-lg'
              : 'bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg'
          }
        >
          <div className="flex items-center justify-between">
            <span>{applyStatus.message}</span>
            {applyResult && applyStatus.type === 'success' && (
              <span className="text-sm text-green-700">
                {t('rulesPage.updatedCount', { count: applyResult.affected })}
              </span>
            )}
          </div>
        </div>
      )}

      {/* Create/Edit Form */}
      {(isCreating || editingId) && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">
              {isCreating ? t('rulesPage.newRule') : t('rulesPage.editRule')}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-white/80 mb-1">
                  {t('rulesPage.ruleName')}
                </label>
                <Input
                  type="text"
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  placeholder={t('rulesPage.ruleNamePlaceholder')}
                />
                {formErrors.name && (
                  <p className="mt-1 text-xs text-red-600">{formErrors.name}</p>
                )}
              </div>
              <div>
                <label className="block text-sm font-medium text-white/80 mb-1">
                  {t('rulesPage.priority')}
                </label>
                <Input
                  type="number"
                  value={formPriority}
                  onChange={(e) => setFormPriority(parseInt(e.target.value) || 0)}
                  min={1}
                />
                {formErrors.priority && (
                  <p className="mt-1 text-xs text-red-600">{formErrors.priority}</p>
                )}
              </div>
            </div>

            <div className="border-t pt-4">
              <h4 className="text-sm font-medium text-white/80 mb-3">{t('rulesPage.matchCondition')}</h4>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm text-white/60 mb-1">{t('rulesPage.field')}</label>
                  <select
                    value={formField}
                    onChange={(e) => setFormField(e.target.value)}
                    className="w-full h-10 px-3 border border-white/15 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    {RULE_MATCH_FIELDS.map((f) => (
                      <option key={f} value={f}>
                        {f.charAt(0).toUpperCase() + f.slice(1)}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm text-white/60 mb-1">{t('rulesPage.matchType')}</label>
                  <select
                    value={formMatchType}
                    onChange={(e) => setFormMatchType(e.target.value)}
                    className="w-full h-10 px-3 border border-white/15 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    {RULE_MATCH_TYPES.map((t) => (
                      <option key={t} value={t}>
                        {t.replace('_', ' ')}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm text-white/60 mb-1">{t('rulesPage.pattern')}</label>
                  <Input
                    type="text"
                    value={formPattern}
                    onChange={(e) => setFormPattern(e.target.value)}
                    placeholder={t('rulesPage.patternPlaceholder')}
                  />
                  {formErrors.pattern && (
                    <p className="mt-1 text-xs text-red-600">{formErrors.pattern}</p>
                  )}
                </div>
              </div>
            </div>

            <div className="border-t pt-4">
              <h4 className="text-sm font-medium text-white/80 mb-3">{t('rulesPage.action')}</h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm text-white/60 mb-1">{t('rulesPage.actionType')}</label>
                  <select
                    value={formActionType}
                    onChange={(e) => {
                      setFormActionType(e.target.value);
                      setFormActionValue('');
                    }}
                    className="w-full h-10 px-3 border border-white/15 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    {RULE_ACTION_TYPES.map((t) => (
                      <option key={t} value={t}>
                        {t.replace('_', ' ')}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm text-white/60 mb-1">{t('rulesPage.value')}</label>
                  {formActionType === 'set_category' ? (
                    <select
                      value={formActionValue}
                      onChange={(e) => setFormActionValue(e.target.value)}
                      className="w-full h-10 px-3 border border-white/15 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="">{t('rulesPage.selectCategory')}</option>
                      {categories.map((cat) => (
                        <option key={cat.id} value={cat.id}>
                          {localizeCategoryName(cat.name, currentLanguage)}
                        </option>
                      ))}
                    </select>
                  ) : formActionType === 'add_tag' ? (
                    <select
                      value={formActionValue}
                      onChange={(e) => setFormActionValue(e.target.value)}
                      className="w-full h-10 px-3 border border-white/15 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="">{t('rulesPage.selectTag')}</option>
                      {tags.map((tag) => (
                        <option key={tag.id} value={tag.id}>
                          {tag.name}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <Input
                      type="text"
                      value={formActionValue}
                      onChange={(e) => setFormActionValue(e.target.value)}
                      placeholder={t('rulesPage.value')}
                    />
                  )}
                  {formErrors.actionValue && (
                    <p className="mt-1 text-xs text-red-600">{formErrors.actionValue}</p>
                  )}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="enabled"
                checked={formEnabled}
                onChange={(e) => setFormEnabled(e.target.checked)}
                className="h-4 w-4 rounded border-white/15"
              />
              <label htmlFor="enabled" className="text-sm text-white/80">
                {t('rulesPage.ruleEnabled')}
              </label>
            </div>

            {formSubmitError && (
              <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                {formSubmitError}
              </div>
            )}
            <div className="flex gap-2">
              <Button onClick={handleSave}>
                {isCreating ? t('rulesPage.create') : t('common.save')}
              </Button>
              <Button variant="outline" onClick={cancelEdit}>
                {t('common.cancel')}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Test Rule Section */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">{t('rulesPage.testRules')}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex gap-2">
            <Input
              type="text"
              value={testText}
              onChange={(e) => {
                setTestText(e.target.value);
              }}
              placeholder={t('rulesPage.testPlaceholder')}
              className="flex-1"
            />
          </div>
          {testResult && (
            <div
              className={`mt-3 p-3 rounded-lg ${
                testResult.matched > 0
                  ? 'bg-green-50 text-green-700'
                  : 'bg-white/5 text-white/80'
              }`}
            >
              {testResult.matched > 0 ? (
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <CheckCircle className="h-4 w-4" />
                    {t('rulesPage.ruleMatched', { matched: testResult.matched, tested: testResult.tested })}
                  </div>
                  <p className="text-xs opacity-90">{t('rulesPage.predictedOutcome')}: {testResult.actionLabel}</p>
                  <div className="max-h-48 overflow-auto rounded border border-green-200/40 bg-white/40 p-2">
                    <ul className="space-y-1 text-xs">
                      {testResult.matches.map((m) => (
                        <li key={m.transaction_id} className="truncate">
                          <span className="font-medium">{m.date}</span> - {m.description}
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <XCircle className="h-4 w-4" />
                  {t('rulesPage.noMatches')}
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Rules List */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Workflow className="h-5 w-5" />
            {t('rulesPage.title')} ({rules.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {rules.length > 0 ? (
            <div className="space-y-2">
              {rules.map((rule) => (
                <div
                  key={rule.id}
                  className={`flex items-center gap-3 p-3 rounded-lg border ${
                    rule.enabled
                      ? 'bg-white/5 border-white/15'
                      : 'bg-white/5 border-white/10 opacity-60'
                  }`}
                >
                  <GripVertical className="h-4 w-4 text-white/25" />

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{rule.name}</span>
                      <Badge variant="outline" className="text-xs">
                        {t('rulesPage.priority')}: {rule.priority}
                      </Badge>
                      {!rule.enabled && (
                        <Badge variant="secondary" className="text-xs">
                          {t('rulesPage.disabled')}
                        </Badge>
                      )}
                    </div>
                    <div className="text-sm text-white/60 mt-1">
                      When <span className="font-mono text-xs bg-white/10 px-1 rounded">{rule.match_field}</span>
                      {' '}{rule.match_type.replace('_', ' ')}{' '}
                      <span className="font-mono text-xs bg-white/10 px-1 rounded">"{rule.match_value}"</span>
                      {' then '}
                      <span className="text-blue-600">{rule.action_type.replace('_', ' ')}</span>
                      {': '}
                      <span className="font-medium">
                        {rule.action_type === 'set_category'
                          ? localizeCategoryName(getActionValueLabel(rule), currentLanguage)
                          : getActionValueLabel(rule)}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-1">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => handleTest(rule.id)}
                      disabled={testingRuleId === rule.id}
                      title="Run rule test"
                    >
                      <Play className="h-4 w-4" />
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => toggleEnabled(rule)}
                    >
                      {rule.enabled ? (
                        <CheckCircle className="h-4 w-4 text-green-500" />
                      ) : (
                        <XCircle className="h-4 w-4 text-white/45" />
                      )}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => startEdit(rule)}
                    >
                      <Pencil className="h-4 w-4 text-white/45" />
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => handleDelete(rule.id)}
                    >
                      <Trash2 className="h-4 w-4 text-red-400" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-white/60 text-center py-8">
              {t('rulesPage.noRules')}
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
