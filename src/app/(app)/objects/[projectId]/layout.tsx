import { ObjectProvider } from "@/components/object-context";
import { requireObject } from "@/features/projects/object";

// Д-94: всё внутри /objects/<id> — работа только по этому объекту. Нет доступа к объекту — 404.
export default async function ObjectLayout({
  children,
  params,
}: LayoutProps<"/objects/[projectId]">) {
  const { projectId } = await params;
  const { project } = await requireObject(projectId);
  return (
    <ObjectProvider project={{ id: project.id, label: project.label }}>{children}</ObjectProvider>
  );
}
