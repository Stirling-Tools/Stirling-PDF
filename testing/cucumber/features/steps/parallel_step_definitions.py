"""Gherkin steps for asserting an operation behaves under concurrency.

Usable either before the request (sets the concurrency level for the send that
follows) or after it (replays the request that was just sent).
"""

from behave import given, then, when

import parallel_support


def _set_repeat(context, count):
    if count < 2:
        context.parallel_repeat = 1
        return

    if getattr(context, "parallel_config", None) is None:
        context.parallel_config = parallel_support.ParallelConfig()
    context.parallel_repeat = count

    # An asked-for level higher than the suite-wide switch already ran wins.
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


@given("the same request is sent {count:d} times in parallel with consistent results")
@when("the same request is sent {count:d} times in parallel with consistent results")
@then("the same request is sent {count:d} times in parallel with consistent results")
def step_same_request_in_parallel(context, count):
    _set_repeat(context, count)


@given("this operation is not run in parallel")
@when("this operation is not run in parallel")
@then("this operation is not run in parallel")
def step_operation_not_in_parallel(context):
    context.parallel_repeat = 1
