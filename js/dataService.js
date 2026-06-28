// =================================================================
// DATASERVICE.JS
// Ansvarar för all kommunikation med datakällan.
// Just nu: localStorage. I framtiden: Firestore.
// =================================================================

const KEYS = {
  CURRENT_USER: 'currentUser',
  ALL_USERS: 'allUsers',
  ALL_CHANNELS: 'allChannels',
  MESSAGES: 'chatMessages',
  CURRENT_CHANNEL_ID: 'currentChannelId',
  LAST_ACTIVE_VIEW: 'lastActiveView'
};

/**
 * Laddar all initial data från localStorage.
 * @returns {object} Ett objekt med all data som behövs för att starta appen.
 */
export function loadInitialData() {
  const currentUser = JSON.parse(localStorage.getItem(KEYS.CURRENT_USER));
  const allUsers = JSON.parse(localStorage.getItem(KEYS.ALL_USERS)) || (currentUser ? { [currentUser.id]: currentUser } : {});
  const allChannels = JSON.parse(localStorage.getItem(KEYS.ALL_CHANNELS)) || {};
  const allMessages = JSON.parse(localStorage.getItem(KEYS.MESSAGES)) || {};
  const currentChannelId = localStorage.getItem(KEYS.CURRENT_CHANNEL_ID);

  return { currentUser, allUsers, allChannels, allMessages, currentChannelId };
}

/**
 * Sparar hela meddelandeobjektet.
 * @param {object} messages - Objektet som innehåller alla meddelanden.
 */
export function saveMessages(messages) {
  localStorage.setItem(KEYS.MESSAGES, JSON.stringify(messages));
}

/**
 * Sparar hela kanalobjektet.
 * @param {object} channels - Objektet som innehåller alla kanaler.
 */
export function saveChannels(channels) {
  localStorage.setItem(KEYS.ALL_CHANNELS, JSON.stringify(channels));
}

/**
 * Sparar hela användarobjektet.
 * @param {object} users - Objektet som innehåller alla användare.
 */
export function saveAllUsers(users) {
  localStorage.setItem(KEYS.ALL_USERS, JSON.stringify(users));
}

/**
 * Sparar den inloggade användarens data.
 * @param {object} user - Användarobjektet för den inloggade användaren.
 */
export function saveCurrentUser(user) {
  localStorage.setItem(KEYS.CURRENT_USER, JSON.stringify(user));
}

/**
 * Hämtar den nuvarande användaren från lagring.
 * @returns {object | null}
 */
export function getCurrentUser() {
  return JSON.parse(localStorage.getItem(KEYS.CURRENT_USER));
}

/**
 * Hämtar alla användare från lagring.
 * @returns {object}
 */
export function getAllUsers() {
    return JSON.parse(localStorage.getItem(KEYS.ALL_USERS)) || {};
}