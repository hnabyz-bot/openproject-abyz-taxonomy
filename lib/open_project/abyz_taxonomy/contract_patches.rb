# frozen_string_literal: true

module OpenProject
  module AbyzTaxonomy
    module ContractPatches
      TITLE_LIKE_PATTERN = /\A\[[^\]]+\]/
      TITLE_LIKE_ERROR = "must be created as an Abyz taxonomy title/section, not as a real Project or WorkPackage"

      module WorkPackageCreateContractPatch
        def self.prepended(base)
          base.validate :validate_abyz_taxonomy_title_like_subject
        end

        private

        def validate_abyz_taxonomy_title_like_subject
          return unless OpenProject::AbyzTaxonomy::ContractPatches.title_like?(model.subject)

          errors.add(:subject, OpenProject::AbyzTaxonomy::ContractPatches::TITLE_LIKE_ERROR)
        end
      end

      module ProjectCreateContractPatch
        def self.prepended(base)
          base.validate :validate_abyz_taxonomy_title_like_project_name
        end

        private

        def validate_abyz_taxonomy_title_like_project_name
          return unless OpenProject::AbyzTaxonomy::ContractPatches.title_like?(model.name)

          errors.add(:name, OpenProject::AbyzTaxonomy::ContractPatches::TITLE_LIKE_ERROR)
        end
      end

      module_function

      def apply!
        unless WorkPackages::CreateContract < WorkPackageCreateContractPatch
          WorkPackages::CreateContract.prepend(WorkPackageCreateContractPatch)
        end

        unless Projects::CreateContract < ProjectCreateContractPatch
          Projects::CreateContract.prepend(ProjectCreateContractPatch)
        end
      end

      def title_like?(value)
        value.to_s.strip.match?(TITLE_LIKE_PATTERN)
      end
    end
  end
end
