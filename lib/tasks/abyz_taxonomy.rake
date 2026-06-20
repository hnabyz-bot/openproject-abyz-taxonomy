# frozen_string_literal: true

namespace :abyz_taxonomy do
  namespace :seed do
    desc "Import PROJ6 legacy title work packages as taxonomy wp_section nodes"
    task proj6_legacy_titles: :environment do
      project = Project.find_by!(identifier: "proj6")

      root = AbyzTaxonomy::Node.find_or_create_by!(code: "ra") do |node|
        node.scope_type = "global"
        node.node_kind = "category"
        node.name = "RA"
        node.position = 100
      end

      mappings = [
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
          subject: "[주요 Project 인증 - Retrofit(HnX-R1)]",
          code: "ra.project_certification.retrofit_hnx_r1",
          name: "주요 Project 인증 - Retrofit(HnX-R1)",
          position: 140
        }
      ]

      mappings.each do |mapping|
        node = AbyzTaxonomy::Node.find_or_create_by!(code: mapping[:code]) do |taxonomy_node|
          taxonomy_node.parent = root
          taxonomy_node.scope_type = "project"
          taxonomy_node.scope_id = project.id
          taxonomy_node.node_kind = "wp_section"
          taxonomy_node.name = mapping[:name]
          taxonomy_node.position = mapping[:position]
        end

        work_package = WorkPackage.find_by(project:, subject: mapping[:subject])
        unless work_package
          warn "skip: #{mapping[:subject]} not found in #{project.identifier}"
          next
        end

        AbyzTaxonomy::Assignment.find_or_create_by!(
          node:,
          entity: work_package,
          role: "legacy_source"
        )

        puts "mapped WP ##{work_package.id} #{work_package.subject} -> #{node.code}"
      end
    end
  end
end

