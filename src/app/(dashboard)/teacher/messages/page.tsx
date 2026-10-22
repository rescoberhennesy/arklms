import MessagesView from '@/components/messages/MessagesView';
import { getThread, listConversations } from '@/lib/actions/messages';

export default async function TeacherMessagesPage({
  searchParams,
}: {
  searchParams: Promise<{ c?: string }>;
}) {
  const { c } = await searchParams;
  const [conversations, thread] = await Promise.all([listConversations(), c ? getThread(c) : Promise.resolve(null)]);
  return <MessagesView basePath="/teacher/messages" conversations={conversations} thread={thread} />;
}