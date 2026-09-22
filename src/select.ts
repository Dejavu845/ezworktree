export function resolveSelection<L extends { id: string; taskId?: string }, T extends { id: string }>(input: {
  view: "holdings" | "forest" | "lanes";
  lanes: L[];
  tasks: T[];
  laneId: string | null;
  taskId: string | null;
}): { lane: L | null; task: T | null } {
  const { view, lanes, tasks, laneId, taskId } = input;
  if (view === "lanes") {
    const task = tasks.find((item) => item.id === taskId) || null;
    const lane =
      (task ? lanes.find((item) => item.taskId === task.id) : undefined) ||
      lanes.find((item) => item.id === laneId) ||
      null;
    return { lane, task };
  }
  const lane = lanes.find((item) => item.id === laneId) || lanes[0] || null;
  const task = lane?.taskId ? tasks.find((item) => item.id === lane.taskId) || null : null;
  return { lane, task };
}
