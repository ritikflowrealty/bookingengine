import { UserPage } from "../load";

export default async function EditUser({ params }: { params: Promise<{ id: string }> }) {
  return <UserPage id={(await params).id} />;
}
