# This file is part of Tryton.  The COPYRIGHT file at the top level of
# this repository contains the full copyright notices and license terms.
"""Jobshop Planning: Material planning and scheduling, as in VISUAL Jobshop

- material.py: the Material Planning window (Open Sales Orders, Non-Stocked
  Parts, Outside Services, Stocked Parts) and Supply & Demand
- schedule.py: the STANDARD schedule and the scheduled operations (the
  calendars are nline_js_shopfloor's)
- scheduler.py: the scheduler and the Scheduling window (Resource Details,
  Work Order Details, Schedule, export to MS Project)
"""
from . import material, schedule, scheduler

# The classes this module registers (see __init__.py)
MODELS = [
    schedule.Schedule,
    schedule.ScheduleOperation,
    material.DeskMaterialPlanning,
    scheduler.DeskScheduling,
    ]
WIZARDS = []
REPORTS = []
