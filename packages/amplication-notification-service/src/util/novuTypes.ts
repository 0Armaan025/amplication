import { AmplicationLogger } from "@amplication/util/nestjs/logging";

export interface UserDetails {
  email?: string;
  firstName?: string;
  lastName?: string;
  phone?: string;
  data?: { [key: string]: string };
}

export interface NovuService {
  createSubscriber: (obj: {
    subscriberId: string;
    payload: UserDetails;
  }) => void;
  updateSubscriber: (obj: {
    subscriberId: string;
    payload: UserDetails;
  }) => void;
  deleteSubscriber: (obj: { subscriberId: string }) => void;
  triggerNotificationToSubscriber: (obj: {
    subscriberId: string;
    eventName: string;
    payload?: { [key: string]: any };
  }) => void;
  broadCastEventToAll: (obj: {
    eventName: string;
    payload?: { [key: string]: any };
  }) => void;
  addSubscribersToTopic: (obj: {
    topicKey: string;
    subscribersIds: string[];
  }) => void;
  removeSubscribersFromTopic: (obj: {
    topicKey: string;
    subscriberId: string[];
  }) => void;
}

export interface Notification {
  notificationMethod: (obj: { [key: string]: any }) => void;
  subscriberId?: string | string[];
  eventName?: string;
  topicKey?: string;
  payload?: { [key: string]: any } | UserDetails;
}

export interface NotificationContext {
  message: { [key: string]: any };
  topic: string;
  novuService: NovuService;
  amplicationLogger: AmplicationLogger;
  notifications: Notification[];
}
