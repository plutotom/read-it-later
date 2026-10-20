import { Layout } from "~/app/_components/layout";
import { ManageStorage } from "~/app/_components/manage-storage";

export default function StoragePage() {
  return (
    <Layout pageTitle="Manage storage">
      <ManageStorage />
    </Layout>
  );
}
