// Componente de UI: module-help.
type Props = {
  title: string;
  steps: readonly string[];
};

export function ModuleHelp({ title, steps }: Props) {
  return (
    <details className="context-help">
      <summary className="context-help-summary">? {title}</summary>
      <ol className="context-help-list">
        {steps.map((step) => (
          <li key={step}>{step}</li>
        ))}
      </ol>
    </details>
  );
}
