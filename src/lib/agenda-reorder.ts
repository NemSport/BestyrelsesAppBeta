export function hasContiguousAgendaPositions(
  occurrences: Array<{ position: number }>,
) {
  return [...occurrences]
    .sort((left, right) => left.position - right.position)
    .every((occurrence, index) => occurrence.position === index);
}
