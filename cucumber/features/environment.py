import os

def before_all(context):
    context.endpoint = None
    context.request_data = None
    context.files = {}
    context.response = None

def after_scenario(context, scenario):
    if hasattr(context, 'files'):
        for file in context.files.values():
            file.close()
    if os.path.exists('response_file'):
        os.remove('response_file')
    if hasattr(context, 'file_name') and os.path.exists(context.file_name):
        os.remove(context.file_name)

    # Remove any temporary files
    for temp_file in os.listdir('.'):
        if temp_file.startswith('genericNonCustomisableName') or temp_file.startswith('temp_image_'):
            os.remove(temp_file)