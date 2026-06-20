# frozen_string_literal: true

class CreateAbyzTaxonomyTables < ActiveRecord::Migration[8.1]
  def change
    create_table :abyz_taxonomy_nodes do |t|
      t.references :parent, foreign_key: { to_table: :abyz_taxonomy_nodes }, null: true
      t.string :scope_type, null: false
      t.integer :scope_id
      t.string :node_kind, null: false
      t.string :code, null: false
      t.string :name, null: false
      t.text :description
      t.string :icon
      t.string :color
      t.integer :position, null: false, default: 0
      t.boolean :active, null: false, default: true
      t.jsonb :rules_json, null: false, default: {}
      t.timestamps
    end

    add_index :abyz_taxonomy_nodes, :code, unique: true
    add_index :abyz_taxonomy_nodes, %i[scope_type scope_id node_kind], name: "idx_abyz_taxonomy_nodes_scope"

    create_table :abyz_taxonomy_assignments do |t|
      t.references :node, null: false, foreign_key: { to_table: :abyz_taxonomy_nodes }
      t.string :entity_type, null: false
      t.bigint :entity_id, null: false
      t.string :role, null: false
      t.integer :position, null: false, default: 0
      t.timestamps
    end

    add_index :abyz_taxonomy_assignments,
              %i[entity_type entity_id role node_id],
              unique: true,
              name: "idx_abyz_taxonomy_assignments_unique"

    create_table :abyz_taxonomy_rules do |t|
      t.references :node, null: false, foreign_key: { to_table: :abyz_taxonomy_nodes }
      t.string :applies_to, null: false
      t.jsonb :rule_json, null: false, default: {}
      t.string :severity, null: false, default: "block"
      t.boolean :active, null: false, default: true
      t.timestamps
    end

    add_index :abyz_taxonomy_rules, %i[node_id applies_to active], name: "idx_abyz_taxonomy_rules_lookup"
  end
end

