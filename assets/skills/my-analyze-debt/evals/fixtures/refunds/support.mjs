export function supportRefundAllowed(order, actor, now) {
  const elapsed = now - order.paidAt;
  return actor.tenantId === order.tenantId
    && order.status === 'PAID'
    && elapsed >= 0
    && elapsed <= 7 * 24 * 60 * 60 * 1000;
}
