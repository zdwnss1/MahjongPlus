import type { CoreExpression } from '@mahjongplus/world-calculus';
import {
  compileExpressionRegisteredContributionEvaluationModule,
  type ExpressionRegisteredContributionEvaluationDefinition,
  type ExpressionRegisteredContributionDefinition,
} from './expressionRegisteredContribution.js';
import {
  compileSemanticQuery,
  compileSemanticValue,
  type SemanticBindingProfile,
  type SemanticQueryDefinition,
  type SemanticValueReference,
} from './semanticQuery.js';
import type { RuleModuleDefinition } from './ruleModules.js';

export interface SemanticRegisteredContributionDefinition
  extends Omit<ExpressionRegisteredContributionDefinition, 'value'> {
  value: number | string | SemanticValueReference;
}

export interface SemanticRegisteredEligibilityRule {
  id: string;
  title?: string;
  query: SemanticQueryDefinition;
  contributions: SemanticRegisteredContributionDefinition[];
  qualification: {
    amount: number;
    stage: string;
  };
}

export interface SemanticRegisteredContributionEvaluationDefinition
  extends Omit<ExpressionRegisteredContributionEvaluationDefinition, 'rules'> {
  semanticProfile: SemanticBindingProfile;
  rules: SemanticRegisteredEligibilityRule[];
}

const context: CoreExpression = { kind: 'variable', name: 'context' };

export function compileSemanticRegisteredContributionEvaluationModule(
  definition: SemanticRegisteredContributionEvaluationDefinition,
): RuleModuleDefinition {
  const rules = definition.rules.map((rule) => ({
    id: rule.id,
    title: rule.title,
    predicate: compileSemanticQuery(
      rule.query,
      definition.semanticProfile,
      { context },
    ),
    contributions: rule.contributions.map((contribution) => ({
      ...contribution,
      value: typeof contribution.value === 'object'
        ? compileSemanticValue(
            contribution.value,
            definition.semanticProfile,
            { context },
          )
        : contribution.value,
    })),
    qualification: structuredClone(rule.qualification),
  }));

  const compiled = compileExpressionRegisteredContributionEvaluationModule({
    ...definition,
    rules,
  });
  compiled.metadata = {
    ...(compiled.metadata ?? {}),
    semanticBindingProfileId: definition.semanticProfile.id,
    semanticQueryRuleIds: definition.rules.map((rule) => rule.id),
  };
  return compiled;
}
