# frozen_string_literal: true

FactoryBot.define do
  factory :abyz_taxonomy_assignment, class: "AbyzTaxonomy::Assignment" do
    association :node, factory: :abyz_taxonomy_node
    role     { "display_parent" }
    position { 0 }

    trait :for_project do
      association :entity, factory: :project
    end

    trait :for_work_package do
      association :entity, factory: :work_package
    end
  end
end
