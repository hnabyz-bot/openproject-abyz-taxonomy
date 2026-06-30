# frozen_string_literal: true

module AbyzTaxonomy
  class UiController < ApplicationController
    before_action :require_admin

    def tree
      render json: {
        _type: "AbyzTaxonomyUiTree",
        **TaxonomyService.tree
      }
    end

    def create_project_title
      node = TaxonomyService.create_project_title!(taxonomy_params)

      render json: {
        _type: "AbyzTaxonomyProjectTitle",
        title: TaxonomyService.serialize_node(node)
      }, status: :created
    rescue TaxonomyError => e
      render_taxonomy_error(e)
    rescue ActiveRecord::RecordInvalid => e
      render_taxonomy_error(TaxonomyError.new(e.record.errors.full_messages.join(", ")))
    end

    def create_project
      project = TaxonomyService.create_project_under_title!(taxonomy_params, user: User.current)

      render json: {
        _type: "AbyzTaxonomyProject",
        project: TaxonomyService.serialize_project(project)
      }, status: :created
    rescue TaxonomyError => e
      render_taxonomy_error(e)
    rescue ActiveRecord::RecordInvalid => e
      render_taxonomy_error(TaxonomyError.new(e.record.errors.full_messages.join(", ")))
    end

    def create_wp_section
      node = TaxonomyService.create_wp_section!(taxonomy_params)

      render json: {
        _type: "AbyzTaxonomyWpSection",
        section: TaxonomyService.serialize_node(node)
      }, status: :created
    rescue TaxonomyError => e
      render_taxonomy_error(e)
    rescue ActiveRecord::RecordInvalid => e
      render_taxonomy_error(TaxonomyError.new(e.record.errors.full_messages.join(", ")))
    end

    def create_work_package
      work_package = TaxonomyService.create_work_package_under_section!(taxonomy_params, user: User.current)

      render json: {
        _type: "AbyzTaxonomyWorkPackage",
        workPackage: TaxonomyService.serialize_work_package(work_package)
      }, status: :created
    rescue TaxonomyError => e
      render_taxonomy_error(e)
    rescue ActiveRecord::RecordInvalid => e
      render_taxonomy_error(TaxonomyError.new(e.record.errors.full_messages.join(", ")))
    end

    def edit_node
      @node = TaxonomyService.find_node!(params[:code])
      @taxonomy_label = taxonomy_label(@node)
      @back_path = node_back_path(@node)
    rescue TaxonomyError => e
      render plain: e.message, status: e.status
    end

    def update_node_settings
      node = TaxonomyService.update_node!(params[:code], taxonomy_settings_params)

      redirect_to node_settings_path(node), notice: "#{taxonomy_label(node)} 세부 정보가 업데이트되었습니다."
    rescue TaxonomyError => e
      @node = TaxonomyService.find_node!(params[:code])
      @taxonomy_label = taxonomy_label(@node)
      @back_path = node_back_path(@node)
      flash.now[:error] = e.message
      render :edit_node, status: e.status
    rescue ActiveRecord::RecordInvalid => e
      @node = e.record
      @taxonomy_label = taxonomy_label(@node)
      @back_path = node_back_path(@node)
      flash.now[:error] = e.record.errors.full_messages.join(", ")
      render :edit_node, status: :unprocessable_entity
    end

    def update_node
      node = TaxonomyService.update_node!(params[:code], taxonomy_params)

      render json: {
        _type: "AbyzTaxonomyNode",
        node: TaxonomyService.serialize_node(node)
      }
    rescue TaxonomyError => e
      render_taxonomy_error(e)
    rescue ActiveRecord::RecordInvalid => e
      render_taxonomy_error(TaxonomyError.new(e.record.errors.full_messages.join(", ")))
    end

    def delete_node
      node = TaxonomyService.delete_node!(params[:code])

      render json: {
        _type: "AbyzTaxonomyDeletedNode",
        code: node.code,
        active: node.active
      }
    rescue TaxonomyError => e
      render_taxonomy_error(e)
    rescue ActiveRecord::RecordInvalid => e
      render_taxonomy_error(TaxonomyError.new(e.record.errors.full_messages.join(", ")))
    end

    def move_wp
      wp_id = taxonomy_params["wpId"].to_i
      to_section_code = taxonomy_params["toSectionCode"].to_s.strip

      raise TaxonomyError, "wpId is required" if wp_id.zero?
      raise TaxonomyError, "toSectionCode is required" if to_section_code.blank?

      TaxonomyService.move_work_package_to_section!(work_package_id: wp_id, to_section_code:)
      render json: { _type: "AbyzTaxonomyMoved", ok: true }
    rescue TaxonomyError => e
      render_taxonomy_error(e)
    rescue ActiveRecord::RecordInvalid => e
      render_taxonomy_error(TaxonomyError.new(e.record.errors.full_messages.join(", ")))
    end

    def move_project
      project_identifier = taxonomy_params["projectIdentifier"].to_s.strip
      to_title_code = taxonomy_params["toTitleCode"].to_s.strip

      raise TaxonomyError, "projectIdentifier is required" if project_identifier.blank?
      raise TaxonomyError, "toTitleCode is required" if to_title_code.blank?

      TaxonomyService.move_project_to_title!(project_identifier:, to_title_code:)
      render json: { _type: "AbyzTaxonomyMoved", ok: true }
    rescue TaxonomyError => e
      render_taxonomy_error(e)
    rescue ActiveRecord::RecordInvalid => e
      render_taxonomy_error(TaxonomyError.new(e.record.errors.full_messages.join(", ")))
    end

    def reorder_node
      code = taxonomy_params["code"].to_s.strip
      before_code = taxonomy_params["beforeCode"].to_s.strip.presence

      raise TaxonomyError, "code is required" if code.blank?

      TaxonomyService.reorder_node!(code, before_code:)
      render json: { _type: "AbyzTaxonomyReordered", ok: true }
    rescue TaxonomyError => e
      render_taxonomy_error(e)
    end

    # @MX:NOTE: 타이틀 계층 이동 — 부모(parent_id) 변경 (#9)
    def move_title
      title_code = taxonomy_params["titleCode"].to_s.strip
      to_parent_code = taxonomy_params["toParentCode"].to_s.strip.presence

      raise TaxonomyError, "titleCode is required" if title_code.blank?

      TaxonomyService.move_title_to_parent!(title_code:, to_parent_code:)
      render json: { _type: "AbyzTaxonomyTitleMoved", ok: true }
    rescue TaxonomyError => e
      render_taxonomy_error(e)
    rescue ActiveRecord::RecordInvalid => e
      render_taxonomy_error(TaxonomyError.new(e.record.errors.full_messages.join(", ")))
    end

    # @MX:NOTE: WP 부모/자식 관계 관리 페이지 (Rails view — OP Angular와 분리, edit_node 패턴)
    def wp_parents
      @project_identifier = params[:project]
      project = Project.find_by(identifier: @project_identifier)
      raise TaxonomyError, "project not found" unless project

      @work_packages = WorkPackage.where(project_id: project.id).order(:id)
      @wp_options = @work_packages.map { |wp| [wp.id, "##{wp.id} #{wp.subject}"] }
    rescue TaxonomyError => e
      render plain: e.message, status: e.status
    end

    # @MX:NOTE: WP 부모 관계 일괄 업데이트 — self/순환 방지 검증 후 UpdateService 호출
    def update_wp_parents
      project = Project.find_by(identifier: params[:project])
      raise TaxonomyError, "project not found" unless project

      changes = params[:parents]&.to_unsafe_h || {}
      changed = 0
      changes.each do |wp_id_str, parent_id_str|
        wp_id = wp_id_str.to_i
        parent_id = parent_id_str.present? ? parent_id_str.to_i : nil
        wp = WorkPackage.find_by(id: wp_id)
        next unless wp && wp.project_id == project.id

        # self/순환 방지
        if parent_id
          raise TaxonomyError, "Cannot set self as parent" if parent_id == wp.id
          parent = WorkPackage.find_by(id: parent_id)
          raise TaxonomyError, "Parent not found" unless parent
          raise TaxonomyError, "Parent must be in the same project" unless parent.project_id == project.id
          ancestor = parent
          while ancestor
            raise TaxonomyError, "Cycle detected" if ancestor.id == wp.id
            ancestor = ancestor.parent
          end
        end

        call = ::WorkPackages::UpdateService.new(user: User.current, model: wp).call(parent: parent_id ? WorkPackage.find(parent_id) : nil)
        raise TaxonomyError, call.errors.full_messages.join(", ") unless call.success?
        changed += 1
      end

      redirect_to "/abyz_taxonomy/ui/wp_parents?project=#{params[:project]}", notice: "#{changed}개 WP의 부모 관계가 업데이트되었습니다."
    rescue TaxonomyError => e
      redirect_to "/abyz_taxonomy/ui/wp_parents?project=#{params[:project]}", alert: e.message
    end

    private

    def taxonomy_params
      raw_params = request.request_parameters.presence || params.to_unsafe_h
      raw_params.except("controller", "action", "ui", "format")
    end

    def taxonomy_settings_params
      raw = params.fetch(:node, {}).to_unsafe_h
      {
        "name" => raw["name"],
        "code" => raw["code"],
        "description" => raw["description"],
        "taxonomyType" => raw["taxonomy_type"]
      }.compact
    end

    def node_settings_path(node)
      "/abyz_taxonomy/ui/nodes/#{ERB::Util.url_encode(node.code)}/settings/general"
    end

    def node_back_path(node)
      if node.node_kind == TaxonomyService::WP_SECTION_KIND && node.scope_id
        project = Project.find_by(id: node.scope_id)
        return "/projects/#{project.identifier}/work_packages" if project
      end

      "/projects"
    end

    def taxonomy_label(node)
      taxonomy_type = node.rules_json && node.rules_json["taxonomyType"]

      return "포트폴리오" if taxonomy_type == "portfolio"
      return "프로그램" if taxonomy_type == "program"
      return "섹션" if node.node_kind == TaxonomyService::WP_SECTION_KIND

      "타이틀"
    end

    def render_taxonomy_error(error)
      render json: {
        _type: "Error",
        message: error.message
      }, status: error.status
    end
  end
end
