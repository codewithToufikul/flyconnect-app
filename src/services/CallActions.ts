/**
 * Global store for call actions taken while the app is in the background or killed.
 * This helps synchronize state when the app re-mounts or comes to the foreground.
 */
export const pendingCallActions = {
  answered: false,
  declined: false,
  tapped: false,
  callUUID: null as string | null,
  callId: null as string | null,
  callerName: null as string | null,
  callerId: null as string | null,
  channelName: null as string | null,
  callType: 'audio' as 'audio' | 'video',
};

export const clearPendingCallActions = () => {
  pendingCallActions.answered = false;
  pendingCallActions.declined = false;
  pendingCallActions.tapped = false;
  pendingCallActions.callUUID = null;
  pendingCallActions.callId = null;
  pendingCallActions.callerName = null;
  pendingCallActions.callerId = null;
  pendingCallActions.channelName = null;
};
