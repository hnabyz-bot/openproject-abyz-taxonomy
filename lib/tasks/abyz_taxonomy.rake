# frozen_string_literal: true

namespace :abyz_taxonomy do
  PROJ6_LEGACY_TITLE_MAPPINGS = [
    {
      subject: "[해외 등록 F-up]",
      code: "ra.overseas_registration_followup",
      name: "해외 등록 F-up",
      position: 110
    },
    {
      subject: "[인허가 유지관리]",
      code: "ra.regulatory_maintenance",
      name: "인허가 유지관리",
      position: 120
    },
    {
      subject: "[규제대응]",
      code: "ra.regulatory_response",
      name: "규제대응",
      position: 130
    },
    {
      subject: "[기타]",
      code: "ra.misc",
      name: "기타",
      position: 190
    },
    {
      subject: "[공통] EUDAMED 제품등록",
      code: "ra.common.eudamed_product_registration",
      name: "공통 EUDAMED 제품등록",
      position: 135
    },
    {
      subject: "[주요 Project 인증 - Retrofit(HnX-R1)]",
      code: "ra.project_certification.retrofit_hnx_r1",
      name: "주요 Project 인증 - Retrofit(HnX-R1)",
      position: 140
    }
  ].freeze

  def proj6_taxonomy_project!
    identifier = ENV.fetch("ABYZ_TAXONOMY_PROJECT_IDENTIFIER", "PROJ6").to_s.downcase
    Project.where("LOWER(identifier) = ?", identifier).first!
  end

  def validate_proj6_taxonomy_contract!(project, mappings = PROJ6_LEGACY_TITLE_MAPPINGS)
    mappings.each do |mapping|
      result = AbyzTaxonomy::TaxonomyService.validate(
        "taxonomyCode" => mapping[:code],
        "projectIdentifier" => project.identifier
      )
      next if result[:valid] && result[:nodeKind] == AbyzTaxonomy::TaxonomyService::WP_SECTION_KIND

      abort "invalid taxonomy contract for #{mapping[:code]}: #{result.inspect}"
    end
  end

  namespace :seed do
    desc "Import PROJ6 legacy title work packages as taxonomy wp_section nodes"
    task proj6_legacy_titles: :environment do
      project = proj6_taxonomy_project!
      strict_wp = ENV["ABYZ_TAXONOMY_STRICT_WP"] == "1"
      rollback = ENV["ABYZ_TAXONOMY_ROLLBACK"] == "1"

      seed = lambda do
        root = AbyzTaxonomy::Node.find_or_initialize_by(code: "ra")
        root.assign_attributes(
          scope_type: "global",
          scope_id: nil,
          node_kind: "wp_category",
          name: "RA",
          position: 100,
          active: true
        )
        root.save!

        missing_subjects = []

        PROJ6_LEGACY_TITLE_MAPPINGS.each do |mapping|
          node = AbyzTaxonomy::Node.find_or_initialize_by(code: mapping[:code])
          node.assign_attributes(
            parent: root,
            scope_type: "project",
            scope_id: project.id,
            node_kind: "wp_section",
            name: mapping[:name],
            position: mapping[:position],
            active: true
          )
          node.save!

          work_package = WorkPackage.find_by(project:, subject: mapping[:subject])
          unless work_package
            missing_subjects << mapping[:subject]
            warn "skip legacy_source assignment: #{mapping[:subject]} not found in #{project.identifier}"
            next
          end

          AbyzTaxonomy::Assignment.find_or_create_by!(
            node:,
            entity: work_package,
            role: "legacy_source"
          )

          puts "mapped WP ##{work_package.id} #{work_package.subject} -> #{node.code}"
        end

        if missing_subjects.any? && strict_wp
          abort "missing legacy title WPs in #{project.identifier}: #{missing_subjects.join(', ')}"
        end

        validate_proj6_taxonomy_contract!(project)
        puts "validated #{PROJ6_LEGACY_TITLE_MAPPINGS.length} taxonomy codes for #{project.identifier}"
      end

      if rollback
        ActiveRecord::Base.transaction do
          seed.call
          puts "ABYZ_TAXONOMY_ROLLBACK=1 set; rolling back seed changes"
          raise ActiveRecord::Rollback
        end
      else
        seed.call
      end
    end
  end

  namespace :verify do
    desc "Verify PROJ6 taxonomy validation contract without mutating data"
    task proj6_contract: :environment do
      project = proj6_taxonomy_project!
      validate_proj6_taxonomy_contract!(project)

      missing = AbyzTaxonomy::TaxonomyService.validate(
        "projectIdentifier" => project.identifier
      )
      abort "missing taxonomyCode contract failed: #{missing.inspect}" unless missing[:valid] == false &&
        missing[:errors].include?("taxonomyCode is required")

      unknown = AbyzTaxonomy::TaxonomyService.validate(
        "taxonomyCode" => "ra.unknown",
        "projectIdentifier" => project.identifier
      )
      abort "unknown taxonomyCode contract failed: #{unknown.inspect}" unless unknown[:valid] == false &&
        unknown[:errors].include?("taxonomyCode is unknown")

      puts "verified PROJ6 taxonomy contract for #{project.identifier}"
    end
  end
end
