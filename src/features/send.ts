import { getConversation } from "@/repos/conversations";
import { sendUserMessage } from "@/features/chat";
import { sendUserMessageInGroup } from "@/features/groupChat";

export async function sendMessage(input: {
  conversationId: string;
  content: string;
  signal?: AbortSignal;
}): Promise<void> {
  const conv = await getConversation(input.conversationId);
  if (!conv) throw new Error("Conversation not found");
  if (conv.kind === "private") {
    await sendUserMessage(input);
  } else {
    await sendUserMessageInGroup(input);
  }
}
