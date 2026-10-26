import type { Migration, MigrationContext, Node } from '@portal-poc/cli/migrations';

const BOOLEAN_OPERATORS = new Set(['===', '!==', '==', '!=', '<', '<=', '>', '>=', 'instanceof', 'in']);

/** `!x`, `a === b`, `true`… — a condition whatever the types say (they may not resolve: JS, no node_modules). */
const isBooleanBySyntax = (node: Node, morph: MigrationContext['morph']): boolean => {
  const { Node: is, SyntaxKind } = morph;
  if (is.isParenthesizedExpression(node)) {
    return isBooleanBySyntax(node.getExpression(), morph);
  }
  return (
    is.isTrueLiteral(node) ||
    is.isFalseLiteral(node) ||
    (is.isPrefixUnaryExpression(node) && node.getOperatorToken() === SyntaxKind.ExclamationToken) ||
    (is.isBinaryExpression(node) && BOOLEAN_OPERATORS.has(node.getOperatorToken().getText()))
  );
};

/**
 * 2.3.0: `useLeaveGuard` takes one object — `useLeaveGuard({ when, message, lock, allows, dialog })` — like the other
 * platform hooks and clients. The positional `(when, options)` form still works but is deprecated and goes in 3.0.
 *
 * Two arguments are always the old form. One argument is the old form when it is a boolean: by syntax or by type
 * (where the app's types resolve). An object literal, or a value typed as an object, is already the new form.
 * Anything else — an untyped single argument, spreads — is left to the developer as a manual step.
 */
export const leaveGuardObject: Migration = {
  id: 'leave-guard-object',
  version: '2.3.0',
  description: 'useLeaveGuard(when, options) → useLeaveGuard({ when, ...options })',
  run: ({ findCalls, morph, replace, manual }) => {
    const { Node: is } = morph;
    for (const call of findCalls('@portal-poc/platform-runtime', 'useLeaveGuard')) {
      const args = call.getArguments();
      const [when, options] = args;
      if (!when || args.length > 2 || args.some((arg) => is.isSpreadElement(arg))) {
        manual('useLeaveGuard with a spread or unexpected arguments: rewrite it as useLeaveGuard({ when, ...options }).', call);
        continue;
      }
      if (args.length === 1 && !isBooleanBySyntax(when, morph)) {
        const type = when.getType();
        if (is.isObjectLiteralExpression(when) || (!type.isAny() && !type.isUnknown() && !type.isBoolean() && !type.isBooleanLiteral())) {
          continue;
        }
        if (type.isAny() || type.isUnknown()) {
          manual(
            `useLeaveGuard(${when.getText()}): the argument's type is unknown — if it is the condition, write useLeaveGuard({ when: ${when.getText()} }).`,
            call,
          );
          continue;
        }
      }

      const entries = [`when: ${when.getText()}`];
      if (options && is.isObjectLiteralExpression(options)) {
        entries.push(...options.getProperties().map((property) => property.getText()));
      } else if (options) {
        entries.push(`...${options.getText()}`);
      }
      let replacement = `{ ${entries.join(', ')} }`;
      if (options?.getText().includes('\n')) {
        const line = call.getSourceFile().getFullText().split('\n')[call.getStartLineNumber() - 1] ?? '';
        const indent = /^\s*/.exec(line)?.[0] ?? '';
        replacement = `{\n${entries.map((entry) => `${indent}  ${entry},`).join('\n')}\n${indent}}`;
      }
      replace([when, options ?? when], replacement);
    }
  },
};
