import modules.scripts as scripts
import modules.shared as shared
import modules.script_callbacks as script_callbacks
import gradio as gr


class PromptSnippetManager(scripts.Script):
    def title(self):
        return "Prompt Snippet Manager"

    def show(self, is_img2img):
        return scripts.AlwaysVisible

    def ui(self, is_img2img):
        # UI is injected directly near prompt boxes via javascript/prompt_snippet_manager.js.
        # This hidden HTML keeps the extension visible to Forge and helps confirm load state.
        gr.HTML("<div id='forge-prompt-snippet-manager-root' style='display:none;'></div>")
        return []


def on_ui_settings():
    section = ("forge_prompt_snippets", "Forge Prompt Snippets")
    shared.opts.add_option(
        "forge_prompt_snippets_ui_density",
        shared.OptionInfo(
            "Comfortable",
            "Popup size mode",
            gr.Radio,
            {"choices": ["Compact", "Comfortable"]},
            section=section,
        ).info("Choose compact or comfortable sizing for snippet popups.").needs_reload_ui(),
    )
    shared.opts.add_option(
        "forge_prompt_snippets_thumbnail_source",
        shared.OptionInfo(
            "Always use latest generation thumbnail",
            "Thumbnail source for new snippets",
            gr.Radio,
            {
                "choices": [
                    "Always use latest generation thumbnail",
                    "Ask before using latest generation thumbnail",
                    "Never auto-use it",
                ]
            },
            section=section,
        ).info("Controls whether a new snippet should try to use the latest generated image as its thumbnail.").needs_reload_ui(),
    )


script_callbacks.on_ui_settings(on_ui_settings)
