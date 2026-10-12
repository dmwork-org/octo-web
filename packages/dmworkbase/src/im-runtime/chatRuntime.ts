export type ImChatListener<TMessage = unknown> = (message: TMessage) => void;
export type ImMessageStatusListener<TMessage = unknown> = (
  message: TMessage
) => void;

export interface ImChatManagerRuntime<TMessage = unknown> {
  addCMDListener: (listener: ImChatListener<TMessage>) => void;
  removeCMDListener: (listener: ImChatListener<TMessage>) => void;
  addMessageListener: (listener: ImChatListener<TMessage>) => void;
  removeMessageListener?: (listener: ImChatListener<TMessage>) => void;
}

export interface ImChatRuntimeSdk<TMessage = unknown> {
  chatManager: ImChatManagerRuntime<TMessage>;
}

export function addImCommandListener<TMessage>(
  sdk: ImChatRuntimeSdk<TMessage>,
  listener: ImChatListener<TMessage>
) {
  sdk.chatManager.addCMDListener(listener);
}

export function addImMessageListener<TMessage>(
  sdk: ImChatRuntimeSdk<TMessage>,
  listener: ImChatListener<TMessage>
) {
  sdk.chatManager.addMessageListener(listener);
}

export function removeImCommandListener<TMessage>(
  sdk: ImChatRuntimeSdk<TMessage>,
  listener: ImChatListener<TMessage>
) {
  sdk.chatManager.removeCMDListener(listener);
}

export function removeImMessageListener<TMessage>(
  sdk: ImChatRuntimeSdk<TMessage>,
  listener: ImChatListener<TMessage>,
) {
  sdk.chatManager.removeMessageListener?.(listener);
}

export function addImMessageStatusListener<TMessage>(
  sdk: ImChatRuntimeSdk<TMessage> & {
    chatManager: {
      addMessageStatusListener: (listener: ImMessageStatusListener<TMessage>) => void;
    };
  },
  listener: ImMessageStatusListener<TMessage>
) {
  sdk.chatManager.addMessageStatusListener(listener);
}

export function removeImMessageStatusListener<TMessage>(
  sdk: ImChatRuntimeSdk<TMessage> & {
    chatManager: {
      removeMessageStatusListener: (listener: ImMessageStatusListener<TMessage>) => void;
    };
  },
  listener: ImMessageStatusListener<TMessage>
) {
  sdk.chatManager.removeMessageStatusListener(listener);
}
