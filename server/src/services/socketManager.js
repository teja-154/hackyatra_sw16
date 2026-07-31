/** Socket.io room manager — ward, department, and role-based rooms */

let ioInstance = null;

export function setupSocketManager(io) {
  ioInstance = io;

  io.on('connection', (socket) => {
    console.log(`🔌 Socket connected: ${socket.id}`);

    // Clients join rooms based on their role
    socket.on('join:ward', (ward) => {
      socket.join(`ward:${ward}`);
    });

    socket.on('join:department', (deptId) => {
      socket.join(`department:${deptId}`);
    });

    socket.on('join:coc', () => {
      socket.join('role:supervisor');
    });

    socket.on('disconnect', () => {
      console.log(`🔌 Socket disconnected: ${socket.id}`);
    });
  });
}

/** Emit to specific rooms — no global broadcast */
export function emitToWard(ward, event, data) {
  if (ioInstance) ioInstance.to(`ward:${ward}`).emit(event, data);
}

export function emitToDepartment(deptId, event, data) {
  if (ioInstance) ioInstance.to(`department:${deptId}`).emit(event, data);
}

export function emitToSupervisors(event, data) {
  if (ioInstance) ioInstance.to('role:supervisor').emit(event, data);
}

/** Emit incident update to all relevant rooms */
export function emitIncidentUpdate(incident, event = 'incident:updated') {
  emitToWard(incident.ward, event, incident);
  if (incident.department) {
    emitToDepartment(incident.department.toString(), event, incident);
  }
  emitToSupervisors(event, incident);
}
