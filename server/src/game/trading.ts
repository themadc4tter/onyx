import { exchangeInventoryItems, getInventory, type InventoryItemQuantity } from "./inventory";

export interface TradeParticipant {
  userId: string;
  socketId: string;
  username: string;
}

export interface TradeOfferItem extends InventoryItemQuantity {
  slotIndex: number;
}

export interface TradeRequest {
  id: string;
  from: TradeParticipant;
  to: TradeParticipant;
  createdAt: number;
}

export interface TradeSession {
  id: string;
  a: TradeParticipant;
  b: TradeParticipant;
  offers: Record<string, TradeOfferItem[]>;
  accepted: Record<string, boolean>;
  createdAt: number;
  updatedAt: number;
}

export interface TradeStatePayload {
  id: string;
  partnerUsername: string;
  ownOffer: TradeOfferItem[];
  otherOffer: TradeOfferItem[];
  ownAccepted: boolean;
  otherAccepted: boolean;
}

export interface TradeActionResult {
  ok: boolean;
  error?: string;
  session?: TradeSession;
  request?: TradeRequest;
  completed?: boolean;
}

const REQUEST_TIMEOUT_MS = 30_000;
const pendingRequests = new Map<string, TradeRequest>();
const activeTradesById = new Map<string, TradeSession>();
const activeTradeIdByUserId = new Map<string, string>();

function createId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function isPendingRequestFresh(request: TradeRequest) {
  return Date.now() - request.createdAt <= REQUEST_TIMEOUT_MS;
}

function clearExpiredRequests() {
  for (const [requestId, request] of pendingRequests) {
    if (!isPendingRequestFresh(request)) {
      pendingRequests.delete(requestId);
    }
  }
}

function resetTradeApproval(session: TradeSession) {
  session.accepted[session.a.userId] = false;
  session.accepted[session.b.userId] = false;
  session.updatedAt = Date.now();
}

function getParticipant(session: TradeSession, userId: string) {
  if (session.a.userId === userId) return session.a;
  if (session.b.userId === userId) return session.b;
  return null;
}

function getPartner(session: TradeSession, userId: string) {
  if (session.a.userId === userId) return session.b;
  if (session.b.userId === userId) return session.a;
  return null;
}

function getTradeForUserId(userId: string) {
  const tradeId = activeTradeIdByUserId.get(userId);
  return tradeId ? activeTradesById.get(tradeId) ?? null : null;
}

export function getTradeSessionForUser(userId: string) {
  return getTradeForUserId(userId);
}

export function createTradeRequest(from: TradeParticipant, to: TradeParticipant): TradeActionResult {
  clearExpiredRequests();

  if (from.userId === to.userId) {
    return { ok: false, error: "self_trade" };
  }

  if (getTradeForUserId(from.userId) || getTradeForUserId(to.userId)) {
    return { ok: false, error: "already_trading" };
  }

  for (const request of pendingRequests.values()) {
    const samePair =
      (request.from.userId === from.userId && request.to.userId === to.userId) ||
      (request.from.userId === to.userId && request.to.userId === from.userId);
    if (samePair) {
      return { ok: false, error: "request_pending" };
    }
  }

  const request: TradeRequest = {
    id: createId("trade-request"),
    from,
    to,
    createdAt: Date.now(),
  };
  pendingRequests.set(request.id, request);
  return { ok: true, request };
}

export function declineTradeRequest(userId: string, requestId: string): TradeActionResult {
  const request = pendingRequests.get(requestId);
  if (!request || request.to.userId !== userId) {
    return { ok: false, error: "request_not_found" };
  }

  pendingRequests.delete(requestId);
  return { ok: true, request };
}

export function acceptTradeRequest(userId: string, requestId: string): TradeActionResult {
  clearExpiredRequests();

  const request = pendingRequests.get(requestId);
  if (!request || request.to.userId !== userId || !isPendingRequestFresh(request)) {
    pendingRequests.delete(requestId);
    return { ok: false, error: "request_not_found" };
  }

  if (getTradeForUserId(request.from.userId) || getTradeForUserId(request.to.userId)) {
    pendingRequests.delete(requestId);
    return { ok: false, error: "already_trading" };
  }

  const session: TradeSession = {
    id: createId("trade"),
    a: request.from,
    b: request.to,
    offers: {
      [request.from.userId]: [],
      [request.to.userId]: [],
    },
    accepted: {
      [request.from.userId]: false,
      [request.to.userId]: false,
    },
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };

  pendingRequests.delete(requestId);
  activeTradesById.set(session.id, session);
  activeTradeIdByUserId.set(request.from.userId, session.id);
  activeTradeIdByUserId.set(request.to.userId, session.id);
  return { ok: true, session, request };
}

export function addTradeOfferItem(userId: string, slotIndex: number, quantity: number): TradeActionResult {
  const session = getTradeForUserId(userId);
  if (!session || !getParticipant(session, userId)) {
    return { ok: false, error: "not_trading" };
  }

  if (!Number.isInteger(slotIndex) || !Number.isInteger(quantity) || quantity <= 0) {
    return { ok: false, error: "invalid_offer" };
  }

  const inventory = getInventory(userId);
  const slot = inventory.slots[slotIndex];
  if (!slot || quantity > slot.quantity) {
    return { ok: false, error: "invalid_offer" };
  }

  const offer = session.offers[userId];
  const existing = offer.find(item => item.slotIndex === slotIndex);
  const alreadyOffered = existing?.quantity ?? 0;
  const nextQuantity = alreadyOffered + quantity;
  if (nextQuantity > slot.quantity) {
    return { ok: false, error: "invalid_offer" };
  }

  if (existing) {
    existing.quantity = nextQuantity;
  } else {
    offer.push({ slotIndex, itemId: slot.itemId, quantity });
  }

  resetTradeApproval(session);
  return { ok: true, session };
}

export function removeTradeOfferItem(userId: string, slotIndex: number): TradeActionResult {
  const session = getTradeForUserId(userId);
  if (!session || !getParticipant(session, userId)) {
    return { ok: false, error: "not_trading" };
  }

  const offer = session.offers[userId];
  const nextOffer = offer.filter(item => item.slotIndex !== slotIndex);
  if (nextOffer.length === offer.length) {
    return { ok: false, error: "invalid_offer" };
  }

  session.offers[userId] = nextOffer;
  resetTradeApproval(session);
  return { ok: true, session };
}

export function setTradeAccepted(userId: string, accepted: boolean): TradeActionResult {
  const session = getTradeForUserId(userId);
  if (!session || !getParticipant(session, userId)) {
    return { ok: false, error: "not_trading" };
  }

  session.accepted[userId] = accepted;
  session.updatedAt = Date.now();

  const completed = session.accepted[session.a.userId] && session.accepted[session.b.userId];
  if (!completed) {
    return { ok: true, session, completed: false };
  }

  const result = exchangeInventoryItems(
    session.a.userId,
    session.b.userId,
    session.offers[session.a.userId],
    session.offers[session.b.userId],
  );
  if (!result.ok) {
    session.accepted[session.a.userId] = false;
    session.accepted[session.b.userId] = false;
    return { ok: false, session, error: result.error ?? "trade_failed" };
  }

  activeTradesById.delete(session.id);
  activeTradeIdByUserId.delete(session.a.userId);
  activeTradeIdByUserId.delete(session.b.userId);
  return { ok: true, session, completed: true };
}

export function cancelTradeForUser(userId: string): TradeSession | null {
  const session = getTradeForUserId(userId);
  if (!session) return null;

  activeTradesById.delete(session.id);
  activeTradeIdByUserId.delete(session.a.userId);
  activeTradeIdByUserId.delete(session.b.userId);
  return session;
}

export function getTradeParticipants(session: TradeSession) {
  return [session.a, session.b];
}

export function getTradePartner(session: TradeSession, userId: string) {
  return getPartner(session, userId);
}

export function getTradeStateForUser(session: TradeSession, userId: string): TradeStatePayload | null {
  const partner = getPartner(session, userId);
  if (!partner) return null;

  return {
    id: session.id,
    partnerUsername: partner.username,
    ownOffer: session.offers[userId].map(item => ({ ...item })),
    otherOffer: session.offers[partner.userId].map(item => ({ ...item })),
    ownAccepted: session.accepted[userId],
    otherAccepted: session.accepted[partner.userId],
  };
}
