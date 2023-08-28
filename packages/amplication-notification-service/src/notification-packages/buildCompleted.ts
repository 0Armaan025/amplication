import { KAFKA_TOPICS } from "@amplication/schema-registry";
import { NotificationContext } from "../util/novuTypes";

export const buildCompleted = async (notificationCtx: NotificationContext) => {
  try {
    if (
      !notificationCtx.message &&
      notificationCtx.topic !== KAFKA_TOPICS.USER_BUILD_TOPIC
    )
      return;

    const { externalId, ...restParams } = notificationCtx.message;
    notificationCtx.notifications.push({
      notificationMethod:
        notificationCtx.novuService.triggerNotificationToSubscriber,
      subscriberId: externalId,
      eventName: "build-completed",
      payload: restParams,
    });

    return notificationCtx;
  } catch (error) {
    notificationCtx.amplicationLogger.error(error.message, error);
  }
};
