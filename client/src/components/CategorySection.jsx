import MedicineCard from './MedicineCard';

const CategorySection = ({ category, onToggle }) => {
  const sortedMedicines = [...category.medicines].sort((a, b) => a.order - b.order);

  return (
    <div className="category-section">
      <div className="category-header" style={{ backgroundColor: category.color }}>
        <span className="category-name">{category.name}</span>
        <span className="category-count">
          {category.medicines.filter(m => m.taken).length} / {category.medicines.length}
        </span>
      </div>
      <div className="category-medicines">
        {sortedMedicines.length === 0 && (
          <p className="empty-message">No medicines added yet</p>
        )}
        {sortedMedicines.map(med => (
          <MedicineCard
            key={med.id}
            medicine={med}
            categoryId={category.id}
            onToggle={onToggle}
          />
        ))}
      </div>
    </div>
  );
};

export default CategorySection;
