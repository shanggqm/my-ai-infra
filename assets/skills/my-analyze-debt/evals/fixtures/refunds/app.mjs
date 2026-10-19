export function appRefundAllowed(order, actor, now) {
  const elapsed = now - order.paidAt;
  return actor.tenantId === order.tenantId
    && order.status === 'PAID'
    && elapsed >= 0
    && elapsed <= 14 * 24 * 60 * 60 * 1000;
}
