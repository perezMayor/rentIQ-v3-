// Componente de UI: main-layout-frame.
type Props = {
  children: React.ReactNode;
  showContentPanel?: boolean;
};

export function MainLayoutFrame({
  children,
  showContentPanel = true,
}: Props) {
  return (
    <div className="main-layout">
      {showContentPanel ? <section className="content-panel">{children}</section> : <>{children}</>}
    </div>
  );
}
