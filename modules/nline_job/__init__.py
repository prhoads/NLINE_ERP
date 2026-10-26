# This file is part of Tryton.  The COPYRIGHT file at the top level of
# this repository contains the full copyright notices and license terms.

from trytond.pool import Pool

from . import job


def register():
    Pool.register(
        job.Configuration,
        job.ConfigurationJobSequence,
        job.Production,
        job.JobCoverage,
        job.MaterialCard,
        job.SaleLine,
        job.CreateJobStart,
        job.CreateJobNeeds,
        job.CreateJobNeed,
        module='nline_job', type_='model')
    Pool.register(
        job.CreateJob,
        module='nline_job', type_='wizard')
