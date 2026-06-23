# frozen_string_literal: true

# open_project/plugins/spec_helper boots Rails (rails_helper) and FactoryBot
# from the host OP app, then configures transactional fixtures.
# Direct `require "rails_helper"` self-resolves when spec/ is on $LOAD_PATH.
require "open_project/plugins/spec_helper"
