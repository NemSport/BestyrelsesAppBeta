import * as Notifications from "expo-notifications";

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldPlaySound: false,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

export async function preparePushNotifications() {
  const current = await Notifications.getPermissionsAsync();
  const finalStatus =
    current.status === "granted"
      ? current.status
      : (await Notifications.requestPermissionsAsync()).status;

  if (finalStatus !== "granted") {
    return {
      enabled: false,
      message: "Push-notifikationer er ikke slået til på denne enhed.",
    };
  }

  try {
    const token = await Notifications.getExpoPushTokenAsync();
    return {
      enabled: true,
      token: token.data,
      message:
        "Push er klar lokalt. Serverregistrering og udsendelse kobles på senere.",
    };
  } catch {
    return {
      enabled: false,
      message:
        "Push-token kunne ikke hentes. Funktionen er forberedt, men ikke aktiv.",
    };
  }
}
