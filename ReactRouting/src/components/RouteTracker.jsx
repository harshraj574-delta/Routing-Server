const RouteTracker = ({ employee }) => {
  console.log('Employee data in tracker:', employee); // Debug log
  
  return (
    <div className="route-tracker">
      <div>ID: {employee.id}</div>
      <div>Gender: {employee.gender}</div>
      <div>Address: {employee.address}</div>
      <div>Shift: {employee.shift || 'N/A'}</div>
      <div>Pick-up Time: {employee.pickupTime || 'N/A'}</div>
      <div>Pick-up Order: {employee.order || 'N/A'}</div>
      <div>Zone: {employee.zone}</div>
    </div>
  );
};

export default RouteTracker; 