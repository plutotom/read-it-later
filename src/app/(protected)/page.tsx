import { InboxView } from "../_components/inbox-view";
import { api, HydrateClient } from "~/trpc/server";

export default async function HomePage() {
  await api.article.getAll.prefetch();

  return (
    <HydrateClient>
      <InboxView />
    </HydrateClient>
  );
}
