from prompts import (
    pdf_qa_system_prompt,
    vision_layout_system_prompt,
    latex_system_prompt,
)


def main():
    assert pdf_qa_system_prompt(), "pdf_qa_system_prompt is empty"
    assert "Do NOT copy" in vision_layout_system_prompt(), "vision prompt missing no-copy rule"
    latex_prompt = latex_system_prompt({}, "document", None)
    assert "\\end{document}" in latex_prompt, "latex prompt missing end document mention"
    print("prompts OK")


if __name__ == "__main__":
    main()

