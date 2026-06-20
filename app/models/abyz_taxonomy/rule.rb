# frozen_string_literal: true

module AbyzTaxonomy
  class Rule < ApplicationRecord
    self.table_name = "abyz_taxonomy_rules"

    belongs_to :node,
               class_name: "AbyzTaxonomy::Node"

    validates :applies_to, :severity, presence: true
  end
end

