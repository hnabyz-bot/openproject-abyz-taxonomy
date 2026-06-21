# frozen_string_literal: true

module AbyzTaxonomy
  class Validation
    def self.validate(payload)
      TaxonomyService.validate(payload)
    end
  end
end
