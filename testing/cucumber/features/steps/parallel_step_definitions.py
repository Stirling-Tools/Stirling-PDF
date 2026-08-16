"""Concurrency steps, usable either before the request or after it."""

from behave import given, then, when

import parallel_support


def _set_repeat(context, count, decoy=False):
    context.parallel_decoy = decoy
    if count < 2:
        context.parallel_repeat = 1
        return
    context.parallel_repeat = count

    # An asked-for level higher than one already run wins.
    if count > getattr(context, "parallel_ran_at", 0):
        context.parallel_validated = False
    if getattr(context, "parallel_validated", False):
        return

    # Placed after the request: replay whichever request was just sent.
    pending = getattr(context, "parallel_request", None)
    if pending is not None:
        url, spec, headers, label = pending
        parallel_support.validate(context, url, spec, headers, context.response, label)
        return

    pending_get = getattr(context, "parallel_get", None)
    if pending_get is not None:
        url, params, headers, label = pending_get
        parallel_support.validate_get(context, url, params, headers, context.response, label)


@given("this operation is run {count:d} times in parallel")
@when("this operation is run {count:d} times in parallel")
@then("this operation is run {count:d} times in parallel")
def step_operation_run_in_parallel(context, count):
    _set_repeat(context, count)


# Decoy traffic is an equal number of concurrent requests carrying different page
# text, so a response that came from the wrong request becomes visible.
@given("this operation is run {count:d} times in parallel against decoy traffic")
@when("this operation is run {count:d} times in parallel against decoy traffic")
@then("this operation is run {count:d} times in parallel against decoy traffic")
def step_operation_run_in_parallel_with_decoy(context, count):
    _set_repeat(context, count, decoy=True)
