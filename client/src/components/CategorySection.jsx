import MedicineCard from './MedicineCard';

const CategorySection = ({ category, stockEnabled, onToggle }) => {
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
        {sortedMedicines.map(med => (
          <MedicineCard
            key={med.id}
            medicine={med}
            categoryId={category.id}
            stockEnabled={stockEnabled}
            onToggle={onToggle}
          />
        ))}
      </div>
    </div>
  );
};

export default CategorySection;
